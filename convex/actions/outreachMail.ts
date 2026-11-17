"use node";
/**
 * The connection to the outreach inbox (Zoho): sends one email over SMTP and reads replies and
 * bounces over IMAP. Small clients written here on Node's tls module (no mail library needed).
 *
 * Convex env: OUTREACH_SMTP_USER, OUTREACH_SMTP_PASS (a Zoho app password), OUTREACH_SMTP_HOST
 * (smtppro.zoho.eu), OUTREACH_SMTP_PORT (465), OUTREACH_IMAP_HOST (imappro.zoho.eu),
 * OUTREACH_IMAP_PORT (993). The schedule and the records are in convex/outreachSend.ts.
 */
import * as tls from "node:tls";
import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalAction } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { buildMessage, classifyIncoming, parseHeaders, type Incoming } from "../helpers/outreachMail";

type SendPayload =
  | { ok: false; reason: string }
  | { ok: true; to: string; step: number; fromName: string; subject: string; text: string; inReplyTo?: string; references: string[] };
type Outcome = "sent" | "bounced" | "retry" | "config_error" | "skipped";

const loadRef = makeFunctionReference<"query", { enrollmentId: Id<"outreachEnrollments"> }, SendPayload>("outreachSend:loadForSend");
const recordRef = makeFunctionReference<
  "mutation",
  { enrollmentId: Id<"outreachEnrollments">; outcome: Outcome; messageId?: string; subject?: string; error?: string },
  null
>("outreachSend:recordSend");
const inboxStateRef = makeFunctionReference<"query", Record<string, never>, { uidValidity: number | null; lastUid: number | null; firstSentAt: number | null }>(
  "outreachSend:inboxState"
);
const processRef = makeFunctionReference<
  "mutation",
  { uidValidity: number; lastUid: number; items: (Incoming & { uid: number })[] },
  { matched: number }
>("outreachSend:processInbox");
const inboxErrorRef = makeFunctionReference<"mutation", { error: string }, null>("outreachSend:recordInboxError");
const guardRef = makeFunctionReference<"query", Record<string, never>, { adminId: Id<"users"> }>("outreach:adminGuard");
const testRef = makeFunctionReference<
  "query",
  { sequenceId: Id<"outreachSequences">; leadId?: Id<"outreachLeads"> },
  { fromName: string; emails: { subject: string; text: string }[] }
>("outreachSend:testPayload");

function config() {
  const user = process.env.OUTREACH_SMTP_USER?.trim();
  const pass = process.env.OUTREACH_SMTP_PASS?.trim();
  if (!user || !pass) return null;
  return {
    user,
    pass,
    domain: user.split("@")[1] ?? "localhost",
    smtpHost: process.env.OUTREACH_SMTP_HOST?.trim() || "smtppro.zoho.eu",
    smtpPort: Number(process.env.OUTREACH_SMTP_PORT) || 465,
    imapHost: process.env.OUTREACH_IMAP_HOST?.trim() || "imappro.zoho.eu",
    imapPort: Number(process.env.OUTREACH_IMAP_PORT) || 993,
  };
}
type Config = NonNullable<ReturnType<typeof config>>;

// ─── A line-based TLS conversation ───────────────────────────────────────────

class Conn {
  private buf = Buffer.alloc(0);
  private waiting: (() => void) | null = null;
  private failed: Error | null = null;
  private constructor(private sock: tls.TLSSocket) {
    sock.on("data", (d: Buffer) => {
      this.buf = Buffer.concat([this.buf, d]);
      this.wake();
    });
    sock.on("error", (e) => {
      this.failed = e;
      this.wake();
    });
    sock.on("close", () => {
      this.failed ??= new Error("The mail server closed the connection");
      this.wake();
    });
  }
  private wake() {
    const w = this.waiting;
    this.waiting = null;
    w?.();
  }
  static open(host: string, port: number): Promise<Conn> {
    return new Promise((resolve, reject) => {
      const sock = tls.connect({ host, port, servername: host });
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new Error(`Couldn't reach ${host}`));
      }, 20_000);
      sock.once("secureConnect", () => {
        clearTimeout(timer);
        sock.setTimeout(60_000, () => sock.destroy(new Error("The mail server stopped answering")));
        resolve(new Conn(sock));
      });
      sock.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }
  private async more() {
    if (this.failed) throw this.failed;
    await new Promise<void>((resolve) => (this.waiting = resolve));
    if (this.failed && this.buf.length === 0) throw this.failed;
  }
  /** The next CRLF-ended line. */
  async line(): Promise<string> {
    for (;;) {
      const i = this.buf.indexOf("\r\n");
      if (i !== -1) {
        const out = this.buf.subarray(0, i).toString("utf8");
        this.buf = this.buf.subarray(i + 2);
        return out;
      }
      await this.more();
    }
  }
  /** Exactly n bytes (an IMAP literal). */
  async bytes(n: number): Promise<Buffer> {
    while (this.buf.length < n) await this.more();
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
  write(text: string) {
    this.sock.write(text);
  }
  close() {
    this.sock.end();
  }
}

// ─── SMTP ────────────────────────────────────────────────────────────────────

class SmtpError extends Error {
  constructor(
    message: string,
    public code: number,
    public stage: string
  ) {
    super(message);
  }
}

async function smtpReply(conn: Conn): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  for (;;) {
    const line = await conn.line();
    lines.push(line);
    if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) return { code: Number(line.slice(0, 3)), text: lines.map((l) => l.slice(4)).join(" ") };
  }
}

async function smtpStep(conn: Conn, command: string | null, expect: number[], stage: string) {
  if (command !== null) conn.write(`${command}\r\n`);
  const reply = await smtpReply(conn);
  if (!expect.includes(reply.code)) throw new SmtpError(`${reply.code} ${reply.text}`.slice(0, 300), reply.code, stage);
  return reply;
}

async function smtpSend(cfg: Config, to: string, message: string) {
  const conn = await Conn.open(cfg.smtpHost, cfg.smtpPort);
  try {
    await smtpStep(conn, null, [220], "connect");
    await smtpStep(conn, `EHLO ${cfg.domain}`, [250], "hello");
    await smtpStep(conn, "AUTH LOGIN", [334], "login");
    await smtpStep(conn, Buffer.from(cfg.user).toString("base64"), [334], "login");
    await smtpStep(conn, Buffer.from(cfg.pass).toString("base64"), [235], "login");
    await smtpStep(conn, `MAIL FROM:<${cfg.user}>`, [250], "from");
    await smtpStep(conn, `RCPT TO:<${to}>`, [250, 251], "recipient");
    await smtpStep(conn, "DATA", [354], "data");
    // Dot-stuffing: a line starting with "." gets another one
    conn.write(`${message.replace(/\r\n\./g, "\r\n..").replace(/^\./, "..")}\r\n.\r\n`);
    await smtpStep(conn, null, [250], "message");
    conn.write("QUIT\r\n");
  } finally {
    conn.close();
  }
}

/** Does the address's domain take email at all? Saves a bounce on dead domains. */
async function domainTakesMail(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code ?? "";
    if (!["ENOTFOUND", "ENODATA"].includes(code)) return true; // a lookup hiccup isn't a dead domain
  }
  try {
    // No MX: mail falls back to the domain's own address
    return (await dns.resolve4(domain)).length > 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code ?? "";
    return !["ENOTFOUND", "ENODATA"].includes(code);
  }
}

const newMessageId = (cfg: Config) => `<${Date.now().toString(36)}.${randomBytes(8).toString("hex")}@${cfg.domain}>`;

/** Sends one scheduled email (outreachSend.tick) and records what happened. */
export const sendOne = internalAction({
  args: { enrollmentId: v.id("outreachEnrollments") },
  handler: async (ctx, args) => {
    const record = (outcome: Outcome, extra: { messageId?: string; subject?: string; error?: string } = {}) =>
      ctx.runMutation(recordRef, { enrollmentId: args.enrollmentId, outcome, ...extra });
    const cfg = config();
    if (!cfg) return await record("config_error", { error: "The outreach inbox isn't connected (OUTREACH_SMTP_USER / OUTREACH_SMTP_PASS)." });
    const mail = await ctx.runQuery(loadRef, { enrollmentId: args.enrollmentId });
    if (!mail.ok) return await record("skipped");
    if (mail.step === 0 && !(await domainTakesMail(mail.to))) {
      return await record("bounced", { error: `${mail.to.split("@")[1]} doesn't take email` });
    }
    const messageId = newMessageId(cfg);
    const message = buildMessage({
      fromName: mail.fromName,
      fromEmail: cfg.user,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      messageId,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      sentAt: Date.now(),
    });
    try {
      await smtpSend(cfg, mail.to, message);
      return await record("sent", { messageId, subject: mail.subject });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (err instanceof SmtpError) {
        if (err.stage === "login" || err.stage === "hello") return await record("config_error", { error: `Zoho refused the login: ${text}` });
        // 5xx on the address itself is permanent; anything else is worth another try later
        if (err.code >= 500 && (err.stage === "recipient" || err.stage === "message")) return await record("bounced", { error: text });
      }
      return await record("retry", { error: text });
    }
  },
});

/** Admin › Send emails › Send me a test: every email of a sequence, to one address, now. */
export const adminSendTest = action({
  args: { sequenceId: v.id("outreachSequences"), to: v.string(), leadId: v.optional(v.id("outreachLeads")) },
  handler: async (ctx, args): Promise<{ sent: number }> => {
    await ctx.runQuery(guardRef, {});
    const cfg = config();
    if (!cfg) throw new ConvexError("Connect the inbox first: OUTREACH_SMTP_USER and OUTREACH_SMTP_PASS on Convex.");
    const to = args.to.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new ConvexError("Type the email address to send the test to.");
    const payload = await ctx.runQuery(testRef, { sequenceId: args.sequenceId, leadId: args.leadId });
    let sent = 0;
    for (const email of payload.emails) {
      try {
        await smtpSend(
          cfg,
          to,
          buildMessage({ fromName: payload.fromName, fromEmail: cfg.user, to, subject: email.subject, text: email.text, messageId: newMessageId(cfg), sentAt: Date.now() })
        );
        sent++;
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        throw new ConvexError(sent ? `Sent ${sent}, then Zoho said: ${text}` : `Zoho said: ${text}`);
      }
    }
    return { sent };
  },
});

// ─── IMAP ────────────────────────────────────────────────────────────────────

type ImapResponse = { text: string; literals: { before: string; data: Buffer }[] };

class Imap {
  private n = 0;
  private constructor(private conn: Conn) {}
  static async open(cfg: Config): Promise<Imap> {
    const conn = await Conn.open(cfg.imapHost, cfg.imapPort);
    const greeting = await conn.line();
    if (!/^\* (OK|PREAUTH)/i.test(greeting)) throw new Error(`IMAP greeting: ${greeting.slice(0, 120)}`);
    return new Imap(conn);
  }
  private async response(): Promise<ImapResponse> {
    let text = "";
    const literals: ImapResponse["literals"] = [];
    for (;;) {
      const line = await this.conn.line();
      const lit = /\{(\d+)\}$/.exec(line);
      if (!lit) return { text: text + line, literals };
      literals.push({ before: line, data: await this.conn.bytes(Number(lit[1])) });
      text += `${line} `;
    }
  }
  async run(command: string): Promise<ImapResponse[]> {
    const tag = `r${++this.n}`;
    this.conn.write(`${tag} ${command}\r\n`);
    const untagged: ImapResponse[] = [];
    for (;;) {
      const res = await this.response();
      if (res.text.startsWith(`${tag} `)) {
        if (!/^\S+ OK/i.test(res.text)) throw new Error(`IMAP ${command.split(" ")[0]}: ${res.text.slice(tag.length + 1, 200)}`);
        return untagged;
      }
      untagged.push(res);
    }
  }
  close() {
    try {
      this.conn.write(`r${++this.n} LOGOUT\r\n`);
    } finally {
      this.conn.close();
    }
  }
}

const quoteImap = (s: string) => `"${s.replace(/(["\\])/g, "\\$1")}"`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const imapDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
};
const FETCH_BATCH = 40;
const HEADER_FIELDS = "FROM SUBJECT IN-REPLY-TO REFERENCES AUTO-SUBMITTED X-AUTOREPLY X-AUTORESPOND PRECEDENCE X-FAILED-RECIPIENTS CONTENT-TYPE CONTENT-TRANSFER-ENCODING";

/**
 * Every 15 minutes: reads new mail in the outreach inbox and passes on what answers our emails
 * (replies, bounces, out-of-office). Nothing is read until the first outreach email has gone out.
 */
export const checkInbox = internalAction({
  args: {},
  handler: async (ctx) => {
    const cfg = config();
    if (!cfg) return null;
    const state = await ctx.runQuery(inboxStateRef, {});
    if (state.firstSentAt === null) return null;
    let imap: Imap | null = null;
    try {
      imap = await Imap.open(cfg);
      await imap.run(`LOGIN ${quoteImap(cfg.user)} ${quoteImap(cfg.pass)}`);
      // Read-only: nothing is marked as read
      const selected = await imap.run("EXAMINE INBOX");
      const selectedText = selected.map((r) => r.text).join(" ");
      const uidValidity = Number(/UIDVALIDITY (\d+)/i.exec(selectedText)?.[1] ?? 0);
      const uidNext = Number(/UIDNEXT (\d+)/i.exec(selectedText)?.[1] ?? 0);
      const fresh = state.uidValidity === null || state.lastUid === null || state.uidValidity !== uidValidity;
      // First run (or the mailbox was rebuilt): everything since the day the first email went out
      const search = fresh ? `UID SEARCH SINCE ${imapDate(state.firstSentAt - 24 * 60 * 60 * 1000)}` : `UID SEARCH UID ${state.lastUid! + 1}:*`;
      const found = (await imap.run(search))
        .flatMap((r) => (/^\* SEARCH/i.test(r.text) ? r.text.replace(/^\* SEARCH/i, "").trim().split(/\s+/) : []))
        .map(Number)
        .filter((uid) => Number.isFinite(uid) && uid > 0 && (fresh || uid > state.lastUid!))
        .sort((a, b) => a - b);
      const batch = found.slice(0, FETCH_BATCH);
      const items: (Incoming & { uid: number })[] = [];
      if (batch.length) {
        const responses = await imap.run(`UID FETCH ${batch.join(",")} (UID BODY.PEEK[HEADER.FIELDS (${HEADER_FIELDS})] BODY.PEEK[TEXT]<0.12000>)`);
        for (const res of responses) {
          const uid = Number(/UID (\d+)/i.exec(res.text)?.[1]);
          if (!/^\* \d+ FETCH/i.test(res.text) || !uid) continue;
          const headerPart = res.literals.find((l) => /HEADER\.FIELDS/i.test(l.before))?.data.toString("utf8") ?? "";
          const bodyPart = res.literals.find((l) => /BODY\[TEXT\]/i.test(l.before))?.data.toString("utf8") ?? "";
          try {
            items.push({ uid, ...classifyIncoming({ headers: parseHeaders(headerPart), body: bodyPart }, cfg.domain) });
          } catch {
            // One odd message mustn't stop the rest
          }
        }
      }
      // Nothing new on a first run: start from the newest message, never from the top of the inbox
      const lastUid = batch.length ? batch[batch.length - 1] : fresh ? Math.max(0, uidNext - 1, ...found) : state.lastUid!;
      // Only what could be ours goes to the database; the rest of the inbox stays in the inbox
      await ctx.runMutation(processRef, {
        uidValidity,
        lastUid,
        items: items.filter((i) => i.messageIds.length || i.bouncedEmails.length || i.fromEmail),
      });
    } catch (err) {
      await ctx.runMutation(inboxErrorRef, { error: err instanceof Error ? err.message : String(err) });
    } finally {
      imap?.close();
    }
    return null;
  },
});

/** Admin › Send emails › Check inbox now. */
export const adminCheckInbox = action({
  args: {},
  handler: async (ctx): Promise<null> => {
    await ctx.runQuery(guardRef, {});
    await ctx.runAction(makeFunctionReference<"action", Record<string, never>, null>("actions/outreachMail:checkInbox"), {});
    return null;
  },
});
