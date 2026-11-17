/**
 * Clinic outreach email (owner, 17 Nov 2026): plain helpers shared by the sending schedule
 * (convex/outreachSend.ts) and the mail connection (convex/actions/outreachMail.ts).
 *
 * Emails go one at a time from the team's own Zoho inbox (hello@myrehabifyhealth.com), never from
 * Rehabify's product domain, so receipts and reminders keep their good name. Plain text only, short,
 * with a reply-"stop" line and a List-Unsubscribe header. No Node APIs here: TextEncoder/Decoder only.
 */

// ─── Lagos clock and the daily allowance ─────────────────────────────────────

/** Lagos has no daylight saving: UTC+1 all year. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function lagosClock(now: number) {
  const d = new Date(now + LAGOS_OFFSET_MS);
  return { day: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** Weekdays after `fromDay` up to and including `toDay` (both "YYYY-MM-DD"); 0 on the first day. */
export function weekdaysBetween(fromDay: string, toDay: string): number {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  let count = 0;
  for (let t = from + DAY_MS; t <= to && count < 400; t += DAY_MS) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

export type Ramp = { dailyStart: number; rampPerDay: number; dailyMax: number; rampStartedOn?: string };

/** A new inbox starts small and grows each weekday: 10, 15, 20… up to the cap. */
export function dailyQuota(ramp: Ramp, today: string): number {
  const grown = ramp.dailyStart + ramp.rampPerDay * weekdaysBetween(ramp.rampStartedOn ?? today, today);
  return Math.max(0, Math.min(ramp.dailyMax, grown));
}

// ─── Templates ───────────────────────────────────────────────────────────────

export const OUTREACH_TAGS = ["{clinic_name}", "{city}"] as const;

/** Tags in the text that we can't fill (a typo like {clinic} would go out as-is). */
export function unknownTags(text: string): string[] {
  const found = text.match(/\{[a-z_ ]+\}/gi) ?? [];
  return [...new Set(found.filter((tag) => !(OUTREACH_TAGS as readonly string[]).includes(tag.toLowerCase())))];
}

export function fillTags(text: string, values: { clinicName: string; city: string }): string {
  return text.replace(/\{clinic_name\}/gi, values.clinicName).replace(/\{city\}/gi, values.city);
}

/** The body as sent: the step's words, the signature, then the reply-"stop" line. */
export function composeText(body: string, signature: string, optOut: string): string {
  return [body.trim(), signature.trim(), optOut.trim()].filter(Boolean).join("\n\n");
}

// ─── Building the message (RFC 5322, quoted-printable) ──────────────────────

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}

function base64Decode(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | (Math.max(0, B64.indexOf(clean[i + 2] ?? "A")) << 6) | Math.max(0, B64.indexOf(clean[i + 3] ?? "A"));
    out.push((n >> 16) & 255);
    if (i + 2 < clean.length) out.push((n >> 8) & 255);
    if (i + 3 < clean.length) out.push(n & 255);
  }
  return new Uint8Array(out);
}

const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** A header value with non-ASCII words as RFC 2047 encoded words, each under 75 characters. */
export function encodeHeader(value: string): string {
  if (isAscii(value)) return value;
  const enc = new TextEncoder();
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (enc.encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${base64(enc.encode(w))}?=`).join("\r\n ");
}

/** Quoted-printable with soft line breaks at 76, never splitting an =XX escape. */
export function qpEncode(text: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  for (const line of text.replace(/\r\n|\r/g, "\n").split("\n")) {
    const bytes = enc.encode(line);
    let encoded = "";
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      const last = i === bytes.length - 1;
      if ((b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last)) encoded += String.fromCharCode(b);
      else encoded += `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
    let rest = encoded;
    while (rest.length > 76) {
      let cut = 75;
      const eq = rest.lastIndexOf("=", cut - 1);
      if (eq !== -1 && eq >= cut - 2) cut = eq;
      out.push(`${rest.slice(0, cut)}=`);
      rest = rest.slice(cut);
    }
    out.push(rest);
  }
  return out.join("\r\n");
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function mailDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${DAYS[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

function displayName(name: string): string {
  const trimmed = name.replace(/[\r\n]+/g, " ").trim();
  if (!trimmed) return "";
  return isAscii(trimmed) ? `"${trimmed.replace(/(["\\])/g, "\\$1")}"` : encodeHeader(trimmed);
}

export type OutgoingMail = {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
  messageId: string; // with the angle brackets
  inReplyTo?: string;
  references?: string[];
  sentAt: number;
};

/** The whole message, CRLF line endings, ready for SMTP DATA (dot-stuffing happens at send time). */
export function buildMessage(mail: OutgoingMail): string {
  const name = displayName(mail.fromName);
  const headers = [
    `From: ${name ? `${name} ` : ""}<${mail.fromEmail}>`,
    `To: <${mail.to}>`,
    `Subject: ${encodeHeader(mail.subject.replace(/[\r\n]+/g, " ").trim())}`,
    `Date: ${mailDate(mail.sentAt)}`,
    `Message-ID: ${mail.messageId}`,
    ...(mail.inReplyTo ? [`In-Reply-To: ${mail.inReplyTo}`] : []),
    ...(mail.references?.length ? [`References: ${mail.references.join("\r\n ")}`] : []),
    `List-Unsubscribe: <mailto:${mail.fromEmail}?subject=unsubscribe>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${qpEncode(mail.text)}\r\n`;
}

// ─── Reading replies and bounces ─────────────────────────────────────────────

export function parseHeaders(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    out[key] = out[key] ? `${out[key]} ${value}` : value;
  }
  return out;
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function decodeQp(text: string): string {
  const soft = text.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === "=" && /^[0-9A-F]{2}$/i.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = soft.charCodeAt(i);
      if (code < 128) bytes.push(code);
      else for (const b of new TextEncoder().encode(soft[i])) bytes.push(b);
    }
  }
  return bytesToText(new Uint8Array(bytes));
}

/** RFC 2047 words in a header ("=?UTF-8?Q?Caf=C3=A9?=") as text. */
export function decodeHeaderWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _charset, kind: string, data: string) =>
      kind.toUpperCase() === "B" ? bytesToText(base64Decode(data)) : decodeQp(data.replace(/_/g, " "))
    );
}

function decodeBody(body: string, transferEncoding: string | undefined): string {
  const te = (transferEncoding ?? "").toLowerCase();
  if (te.includes("quoted-printable")) return decodeQp(body);
  if (te.includes("base64")) return bytesToText(base64Decode(body));
  return body;
}

const stripHtml = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** The readable text of a message body (first text/plain part, else text/html without tags). */
export function plainTextOf(contentType: string | undefined, transferEncoding: string | undefined, raw: string, depth = 0): string {
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(contentType ?? "")?.[1];
  if (!boundary || depth > 3) {
    const text = decodeBody(raw, transferEncoding);
    return /text\/html/i.test(contentType ?? "") ? stripHtml(text) : text;
  }
  const parts = raw.split(`--${boundary}`).slice(1);
  let htmlFallback = "";
  for (const part of parts) {
    const split = part.search(/\r?\n\r?\n/);
    if (split === -1) continue;
    const headers = parseHeaders(part.slice(0, split));
    const body = part.slice(split).replace(/^\r?\n\r?\n/, "");
    const type = headers["content-type"] ?? "text/plain";
    if (/multipart\//i.test(type)) {
      const inner = plainTextOf(type, headers["content-transfer-encoding"], body, depth + 1);
      if (inner.trim()) return inner;
    } else if (/text\/plain/i.test(type)) {
      return decodeBody(body, headers["content-transfer-encoding"]);
    } else if (/text\/html/i.test(type) && !htmlFallback) {
      htmlFallback = stripHtml(decodeBody(body, headers["content-transfer-encoding"]));
    }
  }
  return htmlFallback;
}

/** What they wrote, without the quoted email below it. */
export function replyOnly(text: string): string {
  const lines: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    // "On Tue, 17 Nov … Rehabify <hello@…> wrote:" (Gmail sometimes wraps it over two lines)
    if (/\bwrote:\s*$/i.test(line)) {
      if (lines.length && /^\s*On\s/i.test(lines[lines.length - 1])) lines.pop();
      break;
    }
    if (/^\s*>/.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^\s*From:\s.+/i.test(line) || /^_{8,}/.test(line)) break;
    lines.push(line);
  }
  return lines.join("\n").replace(/\s+/g, " ").trim();
}

export function emailFromHeader(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const angle = /<([^<>@\s]+@[^<>\s]+)>/.exec(value)?.[1];
  const bare = angle ?? /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/i.exec(value)?.[0];
  return bare?.toLowerCase();
}

export type IncomingKind = "reply" | "bounce" | "auto_reply";
export type Incoming = {
  kind: IncomingKind;
  fromEmail?: string;
  subject: string;
  messageIds: string[]; // ours, from In-Reply-To / References (and the bounced copy)
  bouncedEmails: string[];
  intent?: "stop" | "not_interested";
  snippet: string;
};

const STOP_WORDS = /\b(unsubscribe|stop|remove me|take me off|opt[ -]?out|do not (email|contact|message)|don'?t (email|contact|message)|no more emails)\b/i;
const NOT_INTERESTED = /\b(not interested|no,? thanks|no thank you|not for us|not at this time|we('re| are) (good|fine|okay|ok)|no need)\b/i;

/**
 * Sorts a message that arrived in the inbox. `ownDomain` is the sending domain, so we only pick
 * up Message-IDs we wrote. Out-of-office replies are "auto_reply" and never stop a sequence.
 */
export function classifyIncoming(
  msg: { headers: Record<string, string>; body: string },
  ownDomain: string
): Incoming {
  const h = msg.headers;
  const fromEmail = emailFromHeader(h["from"]);
  const subject = decodeHeaderWords(h["subject"] ?? "").trim();
  const idPattern = new RegExp(`<[^<>\\s]+@${ownDomain.replace(/\./g, "\\.")}>`, "gi");
  const idsIn = (s: string | undefined) => (s ? [...s.matchAll(idPattern)].map((m) => m[0]) : []);
  const contentType = h["content-type"] ?? "";

  const bounce =
    /^(mailer-daemon|postmaster|mail-daemon)@/i.test(fromEmail ?? "") ||
    /report-type="?delivery-status/i.test(contentType) ||
    /^(undeliver|returned mail|mail delivery (failed|subsystem)|delivery status notification \(failure\)|failure notice|delivery failure|message not delivered)/i.test(subject);
  // "Still trying to deliver" notices from mail servers are neither a bounce nor a reply
  if (bounce && /\(delay\)|delayed/i.test(subject)) {
    return { kind: "auto_reply", fromEmail, subject, messageIds: [...new Set([...idsIn(h["in-reply-to"]), ...idsIn(h["references"])])], bouncedEmails: [], snippet: subject.slice(0, 200) };
  }
  if (bounce) {
    const failed = [
      ...(h["x-failed-recipients"] ?? "").split(/[,\s]+/),
      ...[...msg.body.matchAll(/(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^\s<>;]+)>?/gi)].map((m) => m[1]),
    ]
      .map((e) => emailFromHeader(e))
      .filter((e): e is string => Boolean(e));
    return {
      kind: "bounce",
      fromEmail,
      subject,
      messageIds: [...new Set([...idsIn(h["in-reply-to"]), ...idsIn(h["references"]), ...idsIn(msg.body)])],
      bouncedEmails: [...new Set(failed)],
      snippet: subject.slice(0, 200),
    };
  }

  const text = plainTextOf(contentType, h["content-transfer-encoding"], msg.body);
  const said = replyOnly(text);
  const auto =
    (h["auto-submitted"] && !/^no$/i.test(h["auto-submitted"])) ||
    Boolean(h["x-autoreply"] || h["x-autorespond"]) ||
    /^(auto|bulk|junk)/i.test(h["precedence"] ?? "") ||
    /^(auto(matic)?[ -]?(reply|response)|out of (the )?office|ooo\b|auto:|autoreply|away from)/i.test(subject);
  const messageIds = [...new Set([...idsIn(h["in-reply-to"]), ...idsIn(h["references"])])];
  if (auto) return { kind: "auto_reply", fromEmail, subject, messageIds, bouncedEmails: [], snippet: said.slice(0, 200) };

  // Our own "reply stop" line can come back unquoted (some apps don't mark the quoted email): it
  // must never turn an interested clinic into "do not contact"
  const theirWords = said.replace(/reply\s+["“”'‘’]?stop["“”'‘’]?/gi, " ").replace(/won'?t email you again/gi, " ");
  const intent = /^\s*unsubscribe\b/i.test(subject) || STOP_WORDS.test(theirWords) ? "stop" : NOT_INTERESTED.test(theirWords) ? "not_interested" : undefined;
  return { kind: "reply", fromEmail, subject, messageIds, bouncedEmails: [], intent, snippet: said.slice(0, 300) };
}
