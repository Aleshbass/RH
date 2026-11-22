/**
 * Employer outreach › Find contacts (owner, 22 Nov 2026): named HR, operations and health & safety
 * people at a company, with work emails that are checked before anyone can email them. The AI
 * search (employerOutreach.ts) found mostly info@ and hr@ inboxes; this asks contact-data
 * providers instead, on their free plans, so every step is careful with credits:
 *
 *  1. Hunter Domain Search (1 search): named people in HR, management, executive and operations,
 *     and the company's email pattern.
 *  2. Apollo People Search (no credits), only when there is still no named HR, operations or
 *     health & safety person. A plan that refuses it is noted and the run carries on.
 *  3. Emails for up to 3 named people without one, cheapest first: Hunter Email Finder, then
 *     Prospeo, then Apollo People Match (which also fills in the last names Apollo's search hides).
 *  4. The check: an email no provider has already verified goes through Hunter's verifier (up to 3
 *     a run; the rest have a Check button). Only "valid" can be emailed unless the team ticks
 *     "send anyway" (lib/employerOutreach.ts emailSendable). A guess from the company's pattern is
 *     only ever a suggestion until it passes the check.
 *
 * One company per scheduled run, up to 5 at a time, skipping companies looked up in the last 30
 * days unless asked again. What each provider has left this month is cached for 10 minutes.
 */
import { ConvexError, v, type Infer } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { autoAdvanceStage, emailDoNotContact, logActivity } from "./helpers/outreachShared";
import {
  ProviderError,
  apolloHealth,
  apolloMatch,
  apolloPeopleSearch,
  emailFromPattern,
  hunterAccount,
  hunterDomainSearch,
  hunterEmailFinder,
  hunterVerify,
  prospeoAccount,
  prospeoFindEmail,
  providerKey,
  type Provider,
} from "./helpers/contactProviders";
import {
  CONTACTS_COOLDOWN_MS,
  MAX_CONTACTS_RUN,
  MAX_EMAIL_LOOKUPS,
  MAX_VERIFY_PER_RUN,
  VERIFY_LABEL,
  roleGroupOf,
  splitName,
  type RoleGroup,
  type VerifyStatus,
} from "../lib/employerOutreach";

type Person = Doc<"outreachContacts">;
type Ctx = QueryCtx | MutationCtx;
type Outcome = "found" | "none" | "skipped" | "no_key" | "refused" | "used_up" | "error";
type StepResult = { provider: Provider; step: string; outcome: Outcome; count?: number; message?: string };

const PROVIDERS: Provider[] = ["hunter", "apollo", "prospeo"];
const CACHE_MS = 10 * 60 * 1000;
const RUN_STALE_MS = 30 * 60 * 1000;
/** Titles for Apollo's search: the people who decide on staff health in a Nigerian company */
const APOLLO_TITLES = [
  "human resources",
  "hr manager",
  "head of people",
  "people and culture",
  "operations manager",
  "head of operations",
  "hse",
  "health and safety",
  "safety officer",
  "admin manager",
];
const KEY_GROUPS = new Set<RoleGroup>(["hr", "operations", "hse"]);
const GROUP_ORDER: Record<RoleGroup, number> = { hr: 0, hse: 1, operations: 2, leadership: 3, other: 4 };

const providerValidator = v.union(v.literal("hunter"), v.literal("apollo"), v.literal("prospeo"));
const verifyValidator = v.union(
  v.literal("valid"),
  v.literal("accept_all"),
  v.literal("unknown"),
  v.literal("webmail"),
  v.literal("disposable"),
  v.literal("invalid")
);
const roleGroupValidator = v.union(v.literal("hr"), v.literal("operations"), v.literal("hse"), v.literal("leadership"), v.literal("other"));
const resultValidator = v.object({
  provider: providerValidator,
  step: v.string(),
  outcome: v.union(
    v.literal("found"),
    v.literal("none"),
    v.literal("skipped"),
    v.literal("no_key"),
    v.literal("refused"),
    v.literal("used_up"),
    v.literal("error")
  ),
  count: v.optional(v.number()),
  message: v.optional(v.string()),
});
/** A person as the run sees them: one already saved (contactId) or one a provider just found */
const chainPersonValidator = v.object({
  contactId: v.optional(v.id("outreachContacts")),
  name: v.string(),
  role: v.optional(v.string()),
  department: v.optional(v.string()),
  roleGroup: roleGroupValidator,
  email: v.optional(v.string()),
  emailStatus: v.optional(v.union(v.literal("hunter"), v.literal("apollo"), v.literal("prospeo"))),
  verifyStatus: v.optional(verifyValidator),
  verifiedBy: v.optional(providerValidator),
  confidence: v.optional(v.number()),
  linkedinUrl: v.optional(v.string()),
  phone: v.optional(v.string()),
  apolloId: v.optional(v.string()),
  nameIncomplete: v.optional(v.boolean()),
  source: v.optional(providerValidator),
  suggestedEmail: v.optional(v.string()),
  emailLookupAt: v.optional(v.number()),
  claimed: v.optional(v.boolean()),
});
type ChainPerson = Infer<typeof chainPersonValidator>;
/** Plus what the run needs to know but never saves */
type WorkPerson = ChainPerson & { doNotContact?: boolean; hadEmail?: boolean; changed?: boolean };
type ChainInput = {
  name: string;
  domain: string;
  emailPattern: string | null;
  people: WorkPerson[];
  budget: { hunterSearches: number | null; hunterChecks: number | null; prospeoCredits: number | null };
};

// Own functions by name (the generated api type is at TypeScript's depth limit)
const guardRef = makeFunctionReference<"query", Record<string, never>, { adminId: Id<"users"> }>("employerOutreach:adminGuard");
const chainLeadRef = makeFunctionReference<"query", { leadId: Id<"outreachLeads"> }, ChainInput | null>("employerContacts:chainLead");
const saveChainRef = makeFunctionReference<
  "mutation",
  { leadId: Id<"outreachLeads">; by: Id<"users">; pattern?: string; people: ChainPerson[]; results: StepResult[]; summary: string },
  null
>("employerContacts:saveChain");
const chainFailedRef = makeFunctionReference<"mutation", { leadId: Id<"outreachLeads">; error: string }, null>("employerContacts:chainFailed");
const runChainRef = makeFunctionReference<"action", { leadIds: Id<"outreachLeads">[]; by: Id<"users">; force: boolean }, null>(
  "employerContacts:runContactChain"
);
const providerRowsRef = makeFunctionReference<"query", Record<string, never>, Doc<"outreachProviderStatus">[]>("employerContacts:providerRows");
const saveProviderRef = makeFunctionReference<
  "mutation",
  { provider: Provider; ok: boolean; message?: string; plan?: string; resetDate?: string; searches?: Pool; verifications?: Pool; credits?: Pool },
  null
>("employerContacts:saveProviderRow");
const verifyLoadRef = makeFunctionReference<
  "query",
  { contactId: Id<"outreachContacts"> },
  { email: string | null; suggestedEmail: string | null } | null
>("employerContacts:contactForVerify");
const verifySaveRef = makeFunctionReference<
  "mutation",
  { contactId: Id<"outreachContacts">; email: string; suggestion: boolean; status: VerifyStatus | "claimed"; by: Id<"users"> },
  null
>("employerContacts:saveVerification");

type Pool = { used?: number; available?: number };
const poolValidator = v.object({ used: v.optional(v.number()), available: v.optional(v.number()) });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const plain = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** "first|last" for spotting the same person found twice ("Mrs. Ada Okafor" and "Ada Okafor"). */
function personKey(name: string) {
  const { first, last } = splitName(name);
  return `${plain(first)}|${plain(last)}`;
}

/**
 * Apollo's search shows "Ok***r" for Okafor: the same person when the first name matches and the
 * full last name starts and ends with what Apollo shows.
 */
function hiddenNameMatches(full: string, shown: string) {
  const a = splitName(full);
  const b = splitName(shown.replace(/\*/g, "x"));
  if (!a.first || !a.last || plain(a.first) !== plain(b.first)) return false;
  const lastShown = shown.trim().split(/\s+/).pop() ?? "";
  const [head, ...rest] = lastShown.split(/\*+/);
  const tail = rest.length ? rest[rest.length - 1] : "";
  const last = a.last.toLowerCase();
  return last.startsWith(head.toLowerCase()) && last.endsWith(tail.toLowerCase());
}

function sameDay(ms: number) {
  return new Date(ms + 3_600_000).toISOString().slice(0, 10);
}

/** What's left in a provider's pool (from the cached account check), or null when not known. */
function left(row: Doc<"outreachProviderStatus"> | undefined, used?: number, available?: number): number | null {
  if (!row || !row.ok || used === undefined || available === undefined) return null;
  // Only while the numbers belong to this month's allowance
  const trusted = row.resetDate ? sameDay(Date.now()) < row.resetDate : Date.now() - row.checkedAt < 24 * 60 * 60 * 1000;
  return trusted ? Math.max(0, available - used) : null;
}

async function providerRowMap(ctx: Ctx) {
  const rows = await ctx.db.query("outreachProviderStatus").take(10);
  return new Map(rows.map((r) => [r.provider, r]));
}

async function markProvidersStale(ctx: MutationCtx) {
  for (const row of await ctx.db.query("outreachProviderStatus").take(10)) {
    if (!row.stale) await ctx.db.patch(row._id, { stale: true });
  }
}

const plainError = (err: unknown) => (err instanceof ProviderError ? err.message : "Something went wrong looking up contacts.");

// ─── The run ─────────────────────────────────────────────────────────────────

/** Steps 1–4 for one company. Pure fetches: everything found is saved in one go by saveChain. */
async function runChain(input: ChainInput, force: boolean): Promise<{ pattern?: string; people: WorkPerson[]; results: StepResult[]; summary: string }> {
  const { domain } = input;
  const results: StepResult[] = [];
  const work: WorkPerson[] = input.people.map((p) => ({ ...p, hadEmail: Boolean(p.email) }));
  const budget = { ...input.budget };
  // A provider that refused, ran out or has no key isn't asked again in this run
  const off = new Set<Provider>(PROVIDERS.filter((p) => !providerKey(p)));
  const stop = (err: unknown) => {
    if (err instanceof ProviderError && err.kind !== "error") off.add(err.provider);
  };
  const outcomeOf = (err: unknown): Outcome => (err instanceof ProviderError ? (err.kind === "no_key" ? "no_key" : err.kind) : "error");
  let pattern = input.emailPattern ?? undefined;
  const now = Date.now();

  const findMatch = (p: { email?: string; apolloId?: string; name: string; nameIncomplete?: boolean }) =>
    work.find(
      (w) =>
        (p.email && w.email === p.email) ||
        (p.apolloId && w.apolloId === p.apolloId) ||
        (!p.nameIncomplete && !w.nameIncomplete && personKey(w.name) === personKey(p.name)) ||
        (p.nameIncomplete && !w.nameIncomplete && hiddenNameMatches(w.name, p.name))
    );

  // 1. Hunter Domain Search
  if (off.has("hunter")) {
    results.push({ provider: "hunter", step: "Domain search", outcome: "no_key", message: "Add HUNTER_API_KEY on Convex." });
  } else if (budget.hunterSearches === 0) {
    results.push({ provider: "hunter", step: "Domain search", outcome: "used_up", message: "Hunter's searches for this month are used up." });
  } else {
    try {
      const found = await hunterDomainSearch(domain);
      if (budget.hunterSearches !== null) budget.hunterSearches--;
      if (found.pattern) pattern = found.pattern;
      let added = 0;
      for (const h of found.people) {
        const name = [h.firstName, h.lastName].filter(Boolean).join(" ");
        const role = h.position;
        const group = roleGroupOf(role ?? h.department);
        const match = findMatch({ email: h.email, name });
        if (match) {
          if (match.doNotContact) continue;
          if (!match.email) Object.assign(match, { email: h.email, emailStatus: "hunter", confidence: h.confidence, changed: true });
          if (match.email === h.email && h.verification && !match.verifyStatus) Object.assign(match, { verifyStatus: h.verification, verifiedBy: "hunter", changed: true });
          if (!match.linkedinUrl && h.linkedinUrl) Object.assign(match, { linkedinUrl: h.linkedinUrl, changed: true });
          if (!match.phone && h.phone) Object.assign(match, { phone: h.phone, changed: true });
          continue;
        }
        work.push({
          name,
          role,
          department: h.department,
          roleGroup: group,
          email: h.email,
          emailStatus: "hunter",
          confidence: h.confidence,
          verifyStatus: h.verification,
          verifiedBy: h.verification ? "hunter" : undefined,
          linkedinUrl: h.linkedinUrl,
          phone: h.phone,
          source: "hunter",
          changed: true,
        });
        added++;
      }
      results.push({
        provider: "hunter",
        step: "Domain search",
        outcome: found.people.length ? "found" : "none",
        count: found.people.length,
        message: found.people.length ? `${found.people.length} named ${found.people.length === 1 ? "person" : "people"}, ${added} new` : "No named people listed",
      });
    } catch (err) {
      stop(err);
      results.push({ provider: "hunter", step: "Domain search", outcome: outcomeOf(err), message: plainError(err) });
    }
  }

  // 2. Apollo People Search, only while there's no named HR, operations or health & safety person
  const haveKeyPerson = work.some((w) => KEY_GROUPS.has(w.roleGroup) && !w.doNotContact);
  if (haveKeyPerson) {
    results.push({ provider: "apollo", step: "People search", outcome: "skipped", message: "Already have HR, operations or health & safety people" });
  } else if (off.has("apollo")) {
    results.push({ provider: "apollo", step: "People search", outcome: "no_key", message: "Add APOLLO_API_KEY on Convex." });
  } else {
    try {
      const found = await apolloPeopleSearch(domain, APOLLO_TITLES);
      let added = 0;
      for (const a of found) {
        const name = [a.firstName, a.lastName].filter(Boolean).join(" ");
        const match = findMatch({ apolloId: a.id, name, nameIncomplete: !a.lastNameComplete });
        if (match) {
          if (!match.apolloId) Object.assign(match, { apolloId: a.id, changed: true });
          if (!match.linkedinUrl && a.linkedinUrl) Object.assign(match, { linkedinUrl: a.linkedinUrl, changed: true });
          continue;
        }
        work.push({
          name,
          role: a.title,
          roleGroup: roleGroupOf(a.title),
          apolloId: a.id,
          nameIncomplete: !a.lastNameComplete || undefined,
          linkedinUrl: a.linkedinUrl,
          source: "apollo",
          changed: true,
        });
        added++;
      }
      results.push({
        provider: "apollo",
        step: "People search",
        outcome: found.length ? "found" : "none",
        count: found.length,
        message: found.length ? `${found.length} ${found.length === 1 ? "person" : "people"}, ${added} new` : "Nobody with those job titles",
      });
    } catch (err) {
      stop(err);
      results.push({ provider: "apollo", step: "People search", outcome: outcomeOf(err), message: plainError(err) });
    }
  }

  // 3. Emails for named people without one: the most useful first, at most 3, and not someone
  // already looked up in the last 30 days (unless the team asked again)
  const lookups = work
    .filter(
      (w) =>
        !w.email &&
        !w.doNotContact &&
        w.roleGroup !== "other" &&
        (force || !w.emailLookupAt || now - w.emailLookupAt > CONTACTS_COOLDOWN_MS) &&
        (Boolean(w.apolloId) || Boolean(splitName(w.name).last))
    )
    .sort((a, b) => GROUP_ORDER[a.roleGroup] - GROUP_ORDER[b.roleGroup] || (a.emailLookupAt ?? 0) - (b.emailLookupAt ?? 0))
    .slice(0, MAX_EMAIL_LOOKUPS);
  const tally: Record<Provider, { tried: number; found: number; error?: { outcome: Outcome; message: string } }> = {
    hunter: { tried: 0, found: 0 },
    prospeo: { tried: 0, found: 0 },
    apollo: { tried: 0, found: 0 },
  };
  const attempt = async (provider: Provider, task: () => Promise<boolean>) => {
    if (off.has(provider)) return false;
    tally[provider].tried++;
    try {
      const ok = await task();
      if (ok) tally[provider].found++;
      return ok;
    } catch (err) {
      stop(err);
      tally[provider].error = { outcome: outcomeOf(err), message: plainError(err) };
      return false;
    }
  };
  const apolloStep = (w: WorkPerson) =>
    attempt("apollo", async () => {
      const { first, last } = splitName(w.name);
      const m = await apolloMatch({
        id: w.apolloId,
        firstName: w.apolloId ? undefined : first,
        lastName: w.apolloId ? undefined : last,
        domain,
        linkedinUrl: w.linkedinUrl,
      });
      if (!m) return false;
      if (w.nameIncomplete && m.firstName && m.lastName) Object.assign(w, { name: `${m.firstName} ${m.lastName}`, nameIncomplete: undefined });
      if (!w.linkedinUrl && m.linkedinUrl) w.linkedinUrl = m.linkedinUrl;
      if (!w.role && m.title) Object.assign(w, { role: m.title, roleGroup: roleGroupOf(m.title) });
      w.changed = true;
      if (!m.email) return false;
      Object.assign(w, { email: m.email, emailStatus: "apollo", ...(m.verified ? { verifyStatus: "valid", verifiedBy: "apollo" } : {}) });
      return true;
    });
  for (const w of lookups) {
    w.emailLookupAt = now;
    w.changed = true;
    let apolloTried = false;
    // A last name Apollo hid can only be filled in by Apollo itself
    if (w.nameIncomplete) {
      apolloTried = true;
      await apolloStep(w);
    }
    const { first, last } = splitName(w.name);
    if (!w.email && first && last && !w.nameIncomplete) {
      if (budget.hunterSearches !== 0) {
        await attempt("hunter", async () => {
          const f = await hunterEmailFinder(domain, first, last);
          if (budget.hunterSearches !== null && f) budget.hunterSearches--;
          if (!f) return false;
          Object.assign(w, {
            email: f.email,
            emailStatus: "hunter",
            confidence: f.confidence,
            ...(f.verification ? { verifyStatus: f.verification, verifiedBy: "hunter" } : {}),
          });
          if (!w.linkedinUrl && f.linkedinUrl) w.linkedinUrl = f.linkedinUrl;
          if (!w.phone && f.phone) w.phone = f.phone;
          return true;
        });
      }
      if (!w.email && budget.prospeoCredits !== 0) {
        await attempt("prospeo", async () => {
          const p = await prospeoFindEmail({ firstName: first, lastName: last, domain, linkedinUrl: w.linkedinUrl });
          if (!p) return false;
          if (budget.prospeoCredits !== null) budget.prospeoCredits--;
          Object.assign(w, { email: p.email, emailStatus: "prospeo", ...(p.verified ? { verifyStatus: "valid", verifiedBy: "prospeo" } : {}) });
          if (!w.linkedinUrl && p.linkedinUrl) w.linkedinUrl = p.linkedinUrl;
          return true;
        });
      }
    }
    if (!w.email && !apolloTried) await apolloStep(w);
  }
  const lookupSteps: [Provider, string][] = [
    ["hunter", "Email finder"],
    ["prospeo", "Email finder"],
    ["apollo", "People match"],
  ];
  for (const [provider, step] of lookupSteps) {
    const t = tally[provider];
    if (t.error) results.push({ provider, step, outcome: t.error.outcome, count: t.found, message: t.error.message });
    else if (t.tried) results.push({ provider, step, outcome: t.found ? "found" : "none", count: t.found, message: `${t.found} of ${t.tried} emails found` });
  }
  if (lookups.length === 0) {
    results.push({ provider: "hunter", step: "Email finder", outcome: "skipped", message: "No named person needs an email" });
  }

  // A guess from the pattern for anyone still without an email: a suggestion, never sent as is
  for (const w of work) {
    if (w.email || w.doNotContact || w.nameIncomplete || !pattern) continue;
    const { first, last } = splitName(w.name);
    const guess = first && last ? emailFromPattern(pattern, first, last, domain) : undefined;
    if (guess && guess !== w.suggestedEmail) Object.assign(w, { suggestedEmail: guess, changed: true });
  }

  // 4. Check new emails no provider has verified yet (the key groups first)
  const toCheck = work
    .filter((w) => w.email && !w.hadEmail && !w.verifyStatus && !w.doNotContact)
    .sort((a, b) => GROUP_ORDER[a.roleGroup] - GROUP_ORDER[b.roleGroup])
    .slice(0, MAX_VERIFY_PER_RUN);
  const checked: Partial<Record<VerifyStatus, number>> = {};
  let checkError: { outcome: Outcome; message: string } | undefined;
  for (const w of toCheck) {
    if (off.has("hunter") || budget.hunterChecks === 0) {
      checkError ??= { outcome: off.has("hunter") ? "skipped" : "used_up", message: "Hunter can't check emails right now; use Check later." };
      break;
    }
    try {
      const status = await hunterVerify(w.email!);
      if (budget.hunterChecks !== null) budget.hunterChecks--;
      if (status === "claimed") Object.assign(w, { claimed: true, changed: true });
      else if (status) {
        Object.assign(w, { verifyStatus: status, verifiedBy: "hunter", changed: true });
        checked[status] = (checked[status] ?? 0) + 1;
      }
    } catch (err) {
      stop(err);
      checkError = { outcome: outcomeOf(err), message: plainError(err) };
      break;
    }
  }
  const checkedCount = Object.values(checked).reduce((a, b) => a + (b ?? 0), 0);
  if (toCheck.length || checkError) {
    const parts = (Object.entries(checked) as [VerifyStatus, number][]).map(([s, n]) => `${n} ${VERIFY_LABEL[s].toLowerCase()}`);
    results.push({
      provider: "hunter",
      step: "Email check",
      outcome: checkError ? checkError.outcome : checkedCount ? "found" : "none",
      count: checkedCount,
      message: checkError?.message ?? (parts.length ? parts.join(", ") : "Still checking: try Check later"),
    });
  }

  const summary = results
    .filter((r) => r.outcome !== "skipped" || r.provider === "apollo")
    .map((r) => `${r.provider === "hunter" ? "Hunter" : r.provider === "apollo" ? "Apollo" : "Prospeo"} ${r.step.toLowerCase()}: ${r.message ?? r.outcome}`)
    .join(". ");
  return { pattern, people: work.filter((w) => w.changed), results, summary: `Find contacts. ${summary}.` };
}

// ─── Queue and run ───────────────────────────────────────────────────────────

/**
 * "Find contacts" for one company or up to 5: queued here and run one company at a time
 * (runContactChain). A company looked up in the last 30 days is skipped unless asked again.
 */
export const adminFindContacts = mutation({
  args: { leadIds: v.array(v.id("outreachLeads")), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerContacts:adminFindContacts");
    const ids = [...new Set(args.leadIds)];
    if (ids.length === 0) throw new ConvexError("Choose at least one company.");
    if (ids.length > MAX_CONTACTS_RUN) throw new ConvexError(`Find contacts for up to ${MAX_CONTACTS_RUN} companies at a time: free plans have small allowances.`);
    if (!PROVIDERS.some((p) => providerKey(p))) throw new ConvexError("Add HUNTER_API_KEY, APOLLO_API_KEY or PROSPEO_API_KEY on Convex first.");
    const now = Date.now();
    const queued: Id<"outreachLeads">[] = [];
    let skipped = 0;
    let noWebsite = 0;
    for (const id of ids) {
      const lead = await ctx.db.get(id);
      if (!lead || lead.kind !== "employer" || lead.stage === "do_not_contact") {
        skipped++;
        continue;
      }
      if (!lead.domain) {
        noWebsite++;
        continue;
      }
      const running = lead.contactsQueuedAt && now - lead.contactsQueuedAt < RUN_STALE_MS;
      const recent = lead.contactsEnrichedAt && now - lead.contactsEnrichedAt < CONTACTS_COOLDOWN_MS;
      if (running || (recent && !args.force)) {
        skipped++;
        continue;
      }
      await ctx.db.patch(id, { contactsQueuedAt: now, contactsEnrichError: undefined });
      queued.push(id);
    }
    if (queued.length) await ctx.scheduler.runAfter(0, runChainRef, { leadIds: queued, by: user._id, force: Boolean(args.force) });
    return { queued: queued.length, skipped, noWebsite };
  },
});

/** One company per run, then the next one is scheduled. */
export const runContactChain = internalAction({
  args: { leadIds: v.array(v.id("outreachLeads")), by: v.id("users"), force: v.boolean() },
  handler: async (ctx, args) => {
    const [leadId, ...rest] = args.leadIds;
    if (!leadId) return null;
    try {
      const input = await ctx.runQuery(chainLeadRef, { leadId });
      if (input) {
        const out = await runChain(input, args.force);
        // Only the saved shape goes to the database
        const people: ChainPerson[] = out.people.map(({ doNotContact: _d, hadEmail: _h, changed: _c, ...p }) => p);
        await ctx.runMutation(saveChainRef, { leadId, by: args.by, pattern: out.pattern, people, results: out.results, summary: out.summary });
      } else {
        await ctx.runMutation(chainFailedRef, { leadId, error: "Add the company's website first." });
      }
    } catch (err) {
      await ctx.runMutation(chainFailedRef, { leadId, error: plainError(err) });
    }
    if (rest.length) await ctx.scheduler.runAfter(1_500, runChainRef, { leadIds: rest, by: args.by, force: args.force });
    return null;
  },
});

export const chainLead = internalQuery({
  args: { leadId: v.id("outreachLeads") },
  handler: async (ctx, args): Promise<ChainInput | null> => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.kind !== "employer" || !lead.domain) return null;
    const people = await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(200);
    const rows = await providerRowMap(ctx);
    const hunter = rows.get("hunter");
    const prospeo = rows.get("prospeo");
    const hunterCredits = left(hunter, hunter?.creditsUsed, hunter?.creditsAvailable);
    return {
      name: lead.name,
      domain: lead.domain,
      emailPattern: lead.emailPattern ?? null,
      people: people.map((p) => ({
        contactId: p._id,
        name: p.name,
        role: p.role,
        department: p.department,
        roleGroup: p.roleGroup,
        email: p.email,
        verifyStatus: p.verifyStatus,
        linkedinUrl: p.linkedinUrl,
        phone: p.phone,
        apolloId: p.apolloId,
        nameIncomplete: p.nameIncomplete,
        suggestedEmail: p.suggestedEmail,
        emailLookupAt: p.emailLookupAt,
        doNotContact: p.doNotContact,
      })),
      budget: {
        // Hunter counts a check as half a credit when the plan has one shared pool
        hunterSearches: left(hunter, hunter?.searchesUsed, hunter?.searchesAvailable) ?? hunterCredits,
        hunterChecks: left(hunter, hunter?.verificationsUsed, hunter?.verificationsAvailable) ?? (hunterCredits === null ? null : hunterCredits * 2),
        prospeoCredits: left(prospeo, prospeo?.creditsUsed, prospeo?.creditsAvailable),
      },
    };
  },
});

export const saveChain = internalMutation({
  args: {
    leadId: v.id("outreachLeads"),
    by: v.id("users"),
    pattern: v.optional(v.string()),
    people: v.array(chainPersonValidator),
    results: v.array(resultValidator),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.kind !== "employer") return null;
    const now = Date.now();
    const existing = await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(200);
    let added = 0;
    let newEmails = 0;
    for (const p of args.people) {
      // The run may have taken a while: match again against what's saved now
      const target =
        (p.contactId ? existing.find((e) => e._id === p.contactId) : undefined) ??
        existing.find(
          (e) =>
            (p.email && e.email === p.email) ||
            (p.apolloId && e.apolloId === p.apolloId) ||
            (!p.nameIncomplete && !e.nameIncomplete && personKey(e.name) === personKey(p.name))
        );
      const blocked = p.email ? await emailDoNotContact(ctx, p.email) : false;
      const verify = p.verifyStatus ? { verifyStatus: p.verifyStatus, verifiedBy: p.verifiedBy, verifiedAt: now } : {};
      if (target) {
        if (p.contactId && !existing.some((e) => e._id === p.contactId)) continue; // removed meanwhile
        const patch: Partial<Person> = { updatedAt: now };
        if (p.email && !target.email) {
          Object.assign(patch, { email: p.email, emailStatus: p.emailStatus, confidence: p.confidence, suggestedEmail: undefined, ...verify });
          newEmails++;
        } else if (p.email && p.email === target.email && p.verifyStatus) {
          Object.assign(patch, verify);
        }
        if (target.nameIncomplete && !p.nameIncomplete) Object.assign(patch, { name: p.name, nameIncomplete: undefined });
        if (!target.role && p.role) Object.assign(patch, { role: p.role, roleGroup: p.roleGroup });
        if (!target.department && p.department) patch.department = p.department;
        if (!target.linkedinUrl && p.linkedinUrl) patch.linkedinUrl = p.linkedinUrl;
        if (!target.phone && p.phone) patch.phone = p.phone;
        if (!target.apolloId && p.apolloId) patch.apolloId = p.apolloId;
        if (p.emailLookupAt) patch.emailLookupAt = p.emailLookupAt;
        if (p.suggestedEmail && !target.email && !patch.email) patch.suggestedEmail = p.suggestedEmail;
        if (p.claimed || (blocked && !target.doNotContact)) patch.doNotContact = true;
        await ctx.db.patch(target._id, patch);
        continue;
      }
      if (p.contactId) continue;
      await ctx.db.insert("outreachContacts", {
        leadId: lead._id,
        name: p.name,
        role: p.role,
        roleGroup: p.roleGroup,
        department: p.department,
        email: p.email,
        emailStatus: p.email ? p.emailStatus : undefined,
        ...verify,
        confidence: p.confidence,
        suggestedEmail: p.email ? undefined : p.suggestedEmail,
        emailLookupAt: p.emailLookupAt,
        apolloId: p.apolloId,
        nameIncomplete: p.nameIncomplete,
        phone: p.phone,
        linkedinUrl: p.linkedinUrl,
        source: p.source ?? "hunter",
        doNotContact: blocked || p.claimed || undefined,
        addedBy: args.by,
        createdAt: now,
      });
      added++;
      if (p.email) newEmails++;
    }
    await ctx.db.patch(lead._id, {
      ...(args.pattern ? { emailPattern: args.pattern } : {}),
      contactsEnrichedAt: now,
      contactsQueuedAt: undefined,
      contactsEnrichError: undefined,
      enrichResults: args.results,
      updatedAt: now,
    });
    await logActivity(ctx, lead._id, "contact_added", args.summary);
    if (added || newEmails) await autoAdvanceStage(ctx, lead._id, "contacts_found", "people found by the contact providers");
    // What was spent shows on the page's next look at the providers
    await markProvidersStale(ctx);
    return null;
  },
});

export const chainFailed = internalMutation({
  args: { leadId: v.id("outreachLeads"), error: v.string() },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (lead) await ctx.db.patch(lead._id, { contactsQueuedAt: undefined, contactsEnrichError: args.error.slice(0, 200), updatedAt: Date.now() });
    await markProvidersStale(ctx);
    return null;
  },
});

// ─── One email at a time ─────────────────────────────────────────────────────

export const contactForVerify = internalQuery({
  args: { contactId: v.id("outreachContacts") },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.contactId);
    if (!p) return null;
    const lead = await ctx.db.get(p.leadId);
    if (lead?.kind !== "employer") return null;
    return { email: p.email ?? null, suggestedEmail: p.suggestedEmail ?? null };
  },
});

/** Check one person's email (or the pattern guess) with Hunter's verifier: one check. */
export const adminVerifyEmail = action({
  args: { contactId: v.id("outreachContacts"), suggestion: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ status: VerifyStatus | "claimed" | null }> => {
    const { adminId } = await ctx.runQuery(guardRef, {});
    if (!providerKey("hunter")) throw new ConvexError("Add HUNTER_API_KEY on Convex to check emails.");
    const p = await ctx.runQuery(verifyLoadRef, { contactId: args.contactId });
    if (!p) throw new ConvexError("That person isn't on the list any more.");
    const email = args.suggestion ? p.suggestedEmail : p.email;
    if (!email) throw new ConvexError("There's no email to check.");
    let status: VerifyStatus | "claimed" | null;
    try {
      status = await hunterVerify(email);
    } catch (err) {
      throw new ConvexError(plainError(err));
    }
    if (status) await ctx.runMutation(verifySaveRef, { contactId: args.contactId, email, suggestion: Boolean(args.suggestion), status, by: adminId });
    return { status };
  },
});

export const saveVerification = internalMutation({
  args: {
    contactId: v.id("outreachContacts"),
    email: v.string(),
    suggestion: v.boolean(),
    status: v.union(verifyValidator, v.literal("claimed")),
    by: v.id("users"),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.contactId);
    if (!p) return null;
    const now = Date.now();
    await markProvidersStale(ctx);
    if (args.status === "claimed") {
      await ctx.db.patch(p._id, { doNotContact: true, suggestedEmail: undefined, updatedAt: now });
      await logActivity(ctx, p.leadId, "note", `${p.name} asked Hunter not to share their email: marked do not contact`, args.by);
      return null;
    }
    const label = VERIFY_LABEL[args.status].toLowerCase();
    if (args.suggestion) {
      if (p.email || p.suggestedEmail !== args.email) return null;
      if (args.status === "invalid" || args.status === "disposable") {
        await ctx.db.patch(p._id, { suggestedEmail: undefined, updatedAt: now });
        await logActivity(ctx, p.leadId, "note", `Guessed ${args.email} for ${p.name}: ${label}, so it was dropped`, args.by);
        return null;
      }
      // A checked guess becomes their email; "accepts all" and "unknown" still need "send anyway"
      const blocked = await emailDoNotContact(ctx, args.email);
      await ctx.db.patch(p._id, {
        email: args.email,
        emailStatus: "pattern",
        verifyStatus: args.status,
        verifiedBy: "hunter",
        verifiedAt: now,
        suggestedEmail: undefined,
        sendAnyway: undefined,
        ...(blocked ? { doNotContact: true } : {}),
        updatedAt: now,
      });
      await logActivity(ctx, p.leadId, "contact_added", `Checked ${args.email} for ${p.name}: ${label}`, args.by);
      await autoAdvanceStage(ctx, p.leadId, "contacts_found", "email checked");
      return null;
    }
    if (p.email !== args.email) return null; // changed while it was being checked
    await ctx.db.patch(p._id, { verifyStatus: args.status, verifiedBy: "hunter", verifiedAt: now, updatedAt: now });
    await logActivity(ctx, p.leadId, "note", `Checked ${args.email} (${p.name}): ${label}`, args.by);
    return null;
  },
});

/** The team's "send anyway" for an email the check couldn't confirm ("accepts all", "unknown"). */
export const adminSetSendAnyway = mutation({
  args: { contactId: v.id("outreachContacts"), sendAnyway: v.boolean() },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerContacts:adminSetSendAnyway");
    const p = await ctx.db.get(args.contactId);
    if (!p) throw new ConvexError("That person isn't on the list any more.");
    const unsure = p.verifyStatus === "accept_all" || p.verifyStatus === "unknown" || p.verifyStatus === "webmail";
    if (args.sendAnyway && !unsure) {
      throw new ConvexError(
        p.verifyStatus === "invalid" || p.verifyStatus === "disposable" ? "This email failed the check, so it can't be sent to." : "Check the email first."
      );
    }
    await ctx.db.patch(p._id, { sendAnyway: args.sendAnyway || undefined, updatedAt: Date.now() });
    if (args.sendAnyway) await logActivity(ctx, p.leadId, "note", `${p.name}: send anyway to ${p.email}`, user._id);
    return null;
  },
});

// ─── What's left with each provider ──────────────────────────────────────────

export const providerRows = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("outreachProviderStatus").take(10),
});

export const saveProviderRow = internalMutation({
  args: {
    provider: providerValidator,
    ok: v.boolean(),
    message: v.optional(v.string()),
    plan: v.optional(v.string()),
    resetDate: v.optional(v.string()),
    searches: v.optional(poolValidator),
    verifications: v.optional(poolValidator),
    credits: v.optional(poolValidator),
  },
  handler: async (ctx, args) => {
    const fields = {
      provider: args.provider,
      ok: args.ok,
      message: args.message,
      plan: args.plan,
      resetDate: args.resetDate,
      searchesUsed: args.searches?.used,
      searchesAvailable: args.searches?.available,
      verificationsUsed: args.verifications?.used,
      verificationsAvailable: args.verifications?.available,
      creditsUsed: args.credits?.used,
      creditsAvailable: args.credits?.available,
      stale: false,
      checkedAt: Date.now(),
    };
    const row = await ctx.db
      .query("outreachProviderStatus")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();
    if (row) await ctx.db.replace(row._id, fields);
    else await ctx.db.insert("outreachProviderStatus", fields);
    return null;
  },
});

/** The strip on the page: which keys are set and what's left (from the cache; never the keys). */
export const adminProviders = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "employerContacts:adminProviders");
    const rows = await providerRowMap(ctx);
    const view = (provider: Provider) => {
      const row = rows.get(provider);
      return {
        configured: Boolean(providerKey(provider)),
        checkedAt: row?.checkedAt ?? null,
        ok: row?.ok ?? null,
        message: row?.message ?? null,
        plan: row?.plan ?? null,
        resetDate: row?.resetDate ?? null,
        searchesLeft: left(row, row?.searchesUsed, row?.searchesAvailable),
        searchesAvailable: row?.searchesAvailable ?? null,
        verificationsLeft: left(row, row?.verificationsUsed, row?.verificationsAvailable),
        verificationsAvailable: row?.verificationsAvailable ?? null,
        creditsLeft: left(row, row?.creditsUsed, row?.creditsAvailable),
        creditsAvailable: row?.creditsAvailable ?? null,
      };
    };
    return { hunter: view("hunter"), apollo: view("apollo"), prospeo: view("prospeo") };
  },
});

/**
 * Asks each provider what's left (their account endpoints cost nothing), at most every 10 minutes
 * unless a run has spent some since, or the team presses Refresh (then at most once a minute).
 */
export const adminRefreshProviders = action({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runQuery(guardRef, {});
    const rows = new Map((await ctx.runQuery(providerRowsRef, {})).map((r) => [r.provider, r]));
    const now = Date.now();
    await Promise.all(
      PROVIDERS.map(async (provider) => {
        if (!providerKey(provider)) return;
        const row = rows.get(provider);
        const age = row ? now - row.checkedAt : Infinity;
        if (age < 60_000 || (!args.force && !row?.stale && age < CACHE_MS)) return;
        try {
          if (provider === "hunter") {
            const a = await hunterAccount();
            await ctx.runMutation(saveProviderRef, {
              provider,
              ok: true,
              plan: a.plan,
              resetDate: a.resetDate,
              searches: a.searches,
              verifications: a.verifications,
              credits: a.credits,
            });
          } else if (provider === "apollo") {
            const h = await apolloHealth();
            await ctx.runMutation(saveProviderRef, { provider, ok: h.ok, message: h.message });
          } else {
            const a = await prospeoAccount();
            await ctx.runMutation(saveProviderRef, {
              provider,
              ok: true,
              plan: a.plan,
              resetDate: a.resetDate,
              // Stored as used and the whole allowance, so "left" works the same for every provider
              credits:
                a.remaining !== undefined ? { used: a.used ?? 0, available: (a.used ?? 0) + a.remaining } : undefined,
            });
          }
        } catch (err) {
          await ctx.runMutation(saveProviderRef, { provider, ok: false, message: plainError(err) });
        }
      })
    );
    return null;
  },
});
