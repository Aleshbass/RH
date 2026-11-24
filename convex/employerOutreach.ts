/**
 * Employer outreach, "Rehabify for Work" sales (owner, 20 Nov 2026): Admin › Employer outreach.
 *
 *  - Finding companies: a city and one or more sectors (lib/employerOutreach.ts) through Google
 *    Places and the AI web search shared with clinic outreach (outreach.ts). Companies live in
 *    outreachLeads with kind "employer", so they never mix with clinics, and the same website
 *    reader (outreach:crawlPending) collects the emails and phones they publish.
 *  - Finding people: "Find people" asks the AI web search for the HR, operations and health &
 *    safety leads at a company, one company at a time. An email is only kept when a public page
 *    shows it (checked here whenever that page can be read); nothing is guessed, and LinkedIn is
 *    never read directly: only links the search itself returned are kept.
 *  - Pipeline: Found → … → Paying, plus Lost and Do not contact, with notes, follow-up dates, an
 *    owner and the deal's size. Three moves are automatic and only ever forward (contacts found,
 *    first email sent, a reply: helpers/outreachShared.ts); the rest are the team's.
 *  - Emails go through the clinic outreach sender (outreachSend.ts): the same inbox, weekday
 *    window and daily cap, employer sequences only, to a company's own address or named people.
 *    The name, signature and "reply stop" line can be Employer outreach's own (adminSaveSender).
 *  - A pilot request on /platform/employers joins the pipeline at "Replied" (pilotToPipeline).
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { autoAdvanceStage, crawlPendingRef as crawlRef, emailDoNotContact, logActivity, stopEnrollment } from "./helpers/outreachShared";
import { outreachNumbers, saveEmployerSender, saveSequence, senderSummary } from "./outreachSend";
import {
  JUNK_EMAIL,
  clean,
  domainOf,
  emailsIn,
  fetchText,
  parseJsonArray,
  phoneKey,
  searchGooglePlaces,
  webSearchText,
  type Candidate,
} from "./outreach";
import {
  EMPLOYER_SECTORS,
  MAX_PEOPLE_RUN,
  MAX_SECTORS_PER_RUN,
  PEOPLE_SEARCH_COOLDOWN_MS,
  STAGE_LABEL,
  canAutoAdvance,
  emailSendable,
  roleGroupOf,
  sectorByKey,
  stageStopsEmails,
  type EmployerStage,
  type RoleGroup,
} from "../lib/employerOutreach";

type Lead = Doc<"outreachLeads">;
type Person = Doc<"outreachContacts">;
type Ctx = QueryCtx | MutationCtx;

const stageValidator = v.union(
  v.literal("found"),
  v.literal("contacts_found"),
  v.literal("contacted"),
  v.literal("replied"),
  v.literal("meeting_booked"),
  v.literal("pilot_proposed"),
  v.literal("pilot_live"),
  v.literal("paying"),
  v.literal("lost"),
  v.literal("do_not_contact")
);
const roleGroupValidator = v.union(v.literal("hr"), v.literal("operations"), v.literal("hse"), v.literal("leadership"), v.literal("other"));
const sourceValidator = v.union(v.literal("google_places"), v.literal("web_search"));

/** Statuses that mean the company's emails stop (as for clinics; a bounce only stops its own address) */
const CLOSED_STATUS = new Set<Lead["status"]>(["do_not_contact", "not_interested", "on_rehabify", "replied"]);
/** Upsert batches, so a big search stays well inside one mutation's limits */
const UPSERT_BATCH = 80;
const MAX_COMPANIES = 3000;
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "mail.com", "gmx.com", "zoho.com", "yandex.com",
]);

// Own functions by name (the generated api type is at TypeScript's depth limit)
type CompanyCandidate = Candidate & { sector: string; staffSize?: string; linkedinUrl?: string };
type SearchLog = { source: string; sector: string; found: number; error?: string };
type FoundPerson = { name: string; role?: string; roleGroup: RoleGroup; email?: string; phone?: string; linkedinUrl?: string; sourceUrl?: string };
const guardRef = makeFunctionReference<"query", Record<string, never>, { adminId: Id<"users"> }>("employerOutreach:adminGuard");
const upsertRef = makeFunctionReference<
  "mutation",
  { city: string; country: string; candidates: CompanyCandidate[]; by: Id<"users"> },
  { added: number; updated: number; skipped: number; addedBy: Record<string, number> }
>("employerOutreach:upsertCompanies");
const logSearchesRef = makeFunctionReference<
  "mutation",
  { city: string; log: (SearchLog & { added: number })[]; by: Id<"users"> },
  null
>("employerOutreach:logSearches");
const peopleLeadRef = makeFunctionReference<
  "query",
  { leadId: Id<"outreachLeads"> },
  { name: string; city: string; country: string | null; website: string | null; domain: string | null } | null
>("employerOutreach:leadForPeople");
const savePeopleRef = makeFunctionReference<
  "mutation",
  { leadId: Id<"outreachLeads">; people: FoundPerson[]; by: Id<"users"> },
  { added: number }
>("employerOutreach:savePeople");
const peopleFailedRef = makeFunctionReference<"mutation", { leadId: Id<"outreachLeads">; error: string }, null>("employerOutreach:peopleSearchFailed");
const runPeopleRef = makeFunctionReference<"action", { leadIds: Id<"outreachLeads">[]; by: Id<"users"> }, null>("employerOutreach:runPeopleSearch");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** "Dangote Cement Plc" → "dangotecement": for spotting the same company twice. */
function companyCore(name: string) {
  const plain = name.toLowerCase().replace(/&/g, " and ");
  const core = plain.replace(/\b(the|ltd|limited|plc|nig|nigeria|company|co|inc|llc|and|holdings)\b/g, " ").replace(/[^a-z0-9]+/g, "");
  return core || plain.replace(/[^a-z0-9]+/g, "");
}

export function companyKey(name: string, city: string) {
  return `${companyCore(name)}|${city.trim().toLowerCase()}`;
}

const employerOf = (rows: Lead[]) => rows.find((r) => r.kind === "employer") ?? null;

const isHttpUrl = (value: string | undefined) => (value && /^https?:\/\/[^\s]+\.[^\s]+/i.test(value) ? value : undefined);
const isLinkedIn = (url: string) => /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(url);
/** A LinkedIn person (/in/) or company (/company/) link exactly as the search returned it. */
function linkedinLink(value: string | undefined, kind: "in" | "company") {
  const url = isHttpUrl(value);
  return url && new RegExp(`^https?://([a-z]{2,3}\\.)?linkedin\\.com/${kind}/[^\\s/?#]+`, "i").test(url) ? url.slice(0, 300) : undefined;
}

function emailOnDomain(email: string, domain: string | undefined) {
  const host = email.split("@")[1] ?? "";
  return Boolean(domain && (host === domain || host.endsWith(`.${domain}`)));
}

/** Addresses on a page, including ones Cloudflare hides behind data-cfemail. */
function pageEmails(html: string): string[] {
  const out = new Set(emailsIn(html));
  for (const m of html.matchAll(/data-cfemail="([0-9a-f]{4,200})"/gi)) {
    const hex = m[1];
    const key = parseInt(hex.slice(0, 2), 16);
    let email = "";
    for (let i = 2; i + 1 < hex.length; i += 2) email += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    for (const found of emailsIn(email)) out.add(found);
  }
  return [...out];
}

/** A person's name, not a department or an inbox ("HR Department", "Customer Care"). */
function looksLikePerson(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 6 || !/[a-z]{2,}/i.test(name) || /@|\d/.test(name)) return false;
  return !/\b(department|dept|team|office|desk|unit|division|human resources|customer|support|enquiries|info|admin|company|limited|ltd|plc|group|services|n\/a|unknown|not found)\b/i.test(name);
}

const personKey = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, " ").trim();

function cleanEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();
  if (!email) return undefined;
  if (emailsIn(email)[0] !== email) throw new ConvexError("That doesn't look like an email address.");
  return email;
}

async function adminNames(ctx: Ctx) {
  const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).take(100);
  return admins.map((u) => ({
    _id: u._id,
    name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Admin",
  }));
}

async function employerLead(ctx: Ctx, leadId: Id<"outreachLeads">): Promise<Lead> {
  const lead = await ctx.db.get(leadId);
  if (!lead || lead.kind !== "employer") throw new ConvexError("That company isn't on the list any more.");
  return lead;
}

// ─── Finding companies ───────────────────────────────────────────────────────

async function placesForSector(key: string, other: string | undefined, city: string, country: string): Promise<Candidate[]> {
  const sector = sectorByKey(key);
  const phrases = key === "other" ? (other ? [other] : []) : (sector?.queries ?? []);
  // Two pages (40 places) per phrase: a sector has up to three phrases
  return await searchGooglePlaces(
    phrases.map((phrase) => `${phrase} in ${city}, ${country}`),
    2
  );
}

async function aiForSector(key: string, other: string | undefined, city: string, country: string): Promise<CompanyCandidate[]> {
  const what = key === "other" ? `companies matching "${other}"` : `companies in the ${sectorByKey(key)?.label.toLowerCase() ?? key} sector`;
  const input = [
    `Find ${what} with offices or operations in ${city}, ${country}.`,
    "Search the web: company websites, business directories, news and search results. Do not open or scrape LinkedIn pages.",
    "For each company give: name, address (its office in that city), phone, email (a general company email such as info@ or hr@), website, staff_size (the approximate number of employees as published, e.g. \"200-500\"), linkedin_url (the company's LinkedIn page, only if it appears in your search results), and source_url (the page where you found its details).",
    "Only include an email, phone or staff size you actually saw published for that company. Never guess or build one; use null instead.",
    "Only real companies that operate in that city. No guessing.",
    'Reply with only a JSON array, up to 30 items: [{"name":"","address":null,"phone":null,"email":null,"website":null,"staff_size":null,"linkedin_url":null,"source_url":null}]',
  ].join("\n");
  const out: CompanyCandidate[] = [];
  for (const row of parseJsonArray(await webSearchText(input))) {
    const name = clean(row?.name, 150);
    if (!name) continue;
    const email = clean(row?.email, 100)?.toLowerCase();
    out.push({
      name,
      address: clean(row?.address, 300),
      phone: clean(row?.phone, 40),
      email: email && emailsIn(email).length === 1 && !JUNK_EMAIL.test(email) ? email : undefined,
      website: clean(row?.website, 300),
      sourceUrl: isHttpUrl(clean(row?.source_url, 300)),
      source: "web_search",
      sector: key,
      staffSize: clean(row?.staff_size, 40),
      linkedinUrl: linkedinLink(clean(row?.linkedin_url, 300), "company"),
    });
  }
  return out;
}

export const adminGuard = query({
  args: {},
  handler: async (ctx) => ({ adminId: (await requireAdmin(ctx, "employerOutreach:adminGuard")).user._id }),
});

/** Finds companies in a city for the chosen sectors, adds the new ones and starts reading their websites. */
export const adminFindCompanies = action({
  args: {
    city: v.string(),
    country: v.optional(v.string()),
    sectors: v.array(v.string()),
    otherQuery: v.optional(v.string()),
    sources: v.array(sourceValidator),
  },
  handler: async (ctx, args): Promise<{ found: number; added: number; updated: number; skipped: number; errors: string[] }> => {
    const { adminId } = await ctx.runQuery(guardRef, {});
    const city = clean(args.city, 80);
    const country = clean(args.country, 60) ?? "Nigeria";
    if (!city) throw new ConvexError("Type a city.");
    const sectors = [...new Set(args.sectors)].filter((key) => sectorByKey(key));
    if (sectors.length === 0) throw new ConvexError("Choose at least one sector.");
    if (sectors.length > MAX_SECTORS_PER_RUN) throw new ConvexError(`Choose up to ${MAX_SECTORS_PER_RUN} sectors at a time.`);
    const other = clean(args.otherQuery, 80);
    if (sectors.includes("other") && !other) throw new ConvexError("Type what to look for under Other.");
    const sources = [...new Set(args.sources)];
    if (sources.length === 0) throw new ConvexError("Choose at least one way to search.");

    // Every sector and finder at once: each one is a few slow searches
    const jobs = sectors.flatMap((sector) => sources.map((source) => ({ sector, source })));
    const results = await Promise.all(
      jobs.map(async ({ sector, source }) => {
        try {
          const found: CompanyCandidate[] =
            source === "google_places"
              ? (await placesForSector(sector, other, city, country)).map((c) => ({ ...c, sector }))
              : await aiForSector(sector, other, city, country);
          return { sector, source, found, error: undefined as string | undefined };
        } catch (err) {
          return { sector, source, found: [] as CompanyCandidate[], error: err instanceof Error ? err.message : String(err) };
        }
      })
    );

    // The same Google place found under two sectors is one company
    const seenPlaces = new Set<string>();
    const candidates: CompanyCandidate[] = [];
    for (const r of results) {
      for (const c of r.found) {
        if (c.placeId && seenPlaces.has(c.placeId)) continue;
        if (c.placeId) seenPlaces.add(c.placeId);
        candidates.push(c);
      }
    }
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const addedBy: Record<string, number> = {};
    for (let i = 0; i < candidates.length; i += UPSERT_BATCH) {
      const res = await ctx.runMutation(upsertRef, { city, country, candidates: candidates.slice(i, i + UPSERT_BATCH), by: adminId });
      added += res.added;
      updated += res.updated;
      skipped += res.skipped;
      for (const [k, n] of Object.entries(res.addedBy)) addedBy[k] = (addedBy[k] ?? 0) + n;
    }
    await ctx.runMutation(logSearchesRef, {
      city,
      by: adminId,
      log: results.map((r) => ({
        source: r.source,
        sector: r.sector,
        found: r.found.length,
        added: addedBy[`${r.source}:${r.sector}`] ?? 0,
        ...(r.error ? { error: r.error.slice(0, 300) } : {}),
      })),
    });
    if (added || updated) await ctx.scheduler.runAfter(0, crawlRef, {});
    const errors = [...new Set(results.flatMap((r) => (r.error ? [r.error] : [])))];
    return { found: candidates.length, added, updated, skipped, errors };
  },
});

const companyValidator = v.object({
  name: v.string(),
  address: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  website: v.optional(v.string()),
  mapsUrl: v.optional(v.string()),
  placeId: v.optional(v.string()),
  rating: v.optional(v.number()),
  reviews: v.optional(v.number()),
  source: sourceValidator,
  sourceUrl: v.optional(v.string()),
  sector: v.string(),
  staffSize: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()),
});

export const upsertCompanies = internalMutation({
  args: { city: v.string(), country: v.string(), candidates: v.array(companyValidator), by: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const addedBy: Record<string, number> = {};
    for (const c of args.candidates) {
      const key = companyKey(c.name, args.city);
      const domain = domainOf(c.website);
      // The same company found again: never a clinic with the same place or website
      const existing =
        (c.placeId ? employerOf(await ctx.db.query("outreachLeads").withIndex("by_place", (q) => q.eq("placeId", c.placeId)).take(5)) : null) ??
        (domain ? employerOf(await ctx.db.query("outreachLeads").withIndex("by_domain", (q) => q.eq("domain", domain)).take(5)) : null) ??
        employerOf(await ctx.db.query("outreachLeads").withIndex("by_name_key", (q) => q.eq("nameKey", key)).take(5));
      const email = c.email?.toLowerCase();
      if (existing) {
        // Fill gaps only: what the team edited or decided stays
        const patch: Partial<Lead> = {};
        if (!existing.phone && c.phone) patch.phone = c.phone;
        if (!existing.address && c.address) patch.address = c.address;
        if (!existing.website && c.website) Object.assign(patch, { website: c.website, domain, crawlStatus: "pending" as const });
        if (!existing.placeId && c.placeId) Object.assign(patch, { placeId: c.placeId, mapsUrl: c.mapsUrl, rating: c.rating, reviews: c.reviews });
        if (!existing.sector) patch.sector = c.sector;
        if (!existing.staffSize && c.staffSize) patch.staffSize = c.staffSize;
        if (!existing.linkedinUrl && c.linkedinUrl) patch.linkedinUrl = c.linkedinUrl;
        if (!existing.email && email && !(await emailDoNotContact(ctx, email))) {
          Object.assign(patch, { email, emailSource: c.source });
          if (existing.status === "new" || existing.status === "no_email") patch.status = "ready";
        }
        if (Object.keys(patch).length) {
          await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
          if (patch.email) await autoAdvanceStage(ctx, existing._id, "contacts_found", "email found in a search");
          updated++;
        } else skipped++;
        continue;
      }
      const blocked = await emailDoNotContact(ctx, email);
      const status: Lead["status"] = blocked ? "do_not_contact" : email ? "ready" : "new";
      const stage: EmployerStage = blocked ? "do_not_contact" : email ? "contacts_found" : "found";
      await ctx.db.insert("outreachLeads", {
        kind: "employer",
        name: c.name,
        nameKey: key,
        city: args.city,
        country: args.country,
        address: c.address,
        phone: c.phone,
        email,
        emailSource: email ? c.source : undefined,
        website: c.website,
        domain,
        mapsUrl: c.mapsUrl,
        placeId: c.placeId,
        rating: c.rating,
        reviews: c.reviews,
        source: c.source,
        sourceUrl: c.sourceUrl,
        status,
        crawlStatus: c.website && !blocked ? "pending" : undefined,
        sector: c.sector,
        staffSize: c.staffSize,
        linkedinUrl: c.linkedinUrl,
        stage,
        stageChangedAt: now,
        addedBy: args.by,
        createdAt: now,
        updatedAt: now,
      });
      added++;
      addedBy[`${c.source}:${c.sector}`] = (addedBy[`${c.source}:${c.sector}`] ?? 0) + 1;
    }
    return { added, updated, skipped, addedBy };
  },
});

export const logSearches = internalMutation({
  args: {
    city: v.string(),
    by: v.id("users"),
    log: v.array(v.object({ source: v.string(), sector: v.string(), found: v.number(), added: v.number(), error: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const entry of args.log) {
      await ctx.db.insert("outreachSearches", {
        kind: "employer",
        sectors: [entry.sector],
        city: args.city,
        source: entry.source,
        found: entry.found,
        added: entry.added,
        error: entry.error,
        by: args.by,
        createdAt: now,
      });
    }
    return null;
  },
});

// ─── Finding people ──────────────────────────────────────────────────────────

/** The AI web search for the people who decide on staff health at one company, filtered hard. */
async function findPeopleAt(lead: { name: string; city: string; country: string | null; website: string | null; domain: string | null }): Promise<FoundPerson[]> {
  const where = [lead.city, lead.country ?? "Nigeria"].filter(Boolean).join(", ");
  const input = [
    `Find the people who decide on staff health and welfare at ${lead.name}${lead.website ? ` (${lead.website})` : ""}${where ? `, ${where}` : ""}:`,
    "- the HR manager, Head of HR or Head of People",
    "- the Head of Operations",
    "- the HSE or Health and Safety officer or manager",
    "If none of these can be found, give one senior leader instead (MD, CEO, General Manager or Country Manager).",
    "Search the web: the company's own website (team, leadership, contact and careers pages), news, press releases, event speaker pages and public directories.",
    "Do not open or scrape LinkedIn pages. Only give a LinkedIn profile link if it appears in your search results.",
    "For each person give: name, role (as written), email, phone, linkedin_url, source_url (the page where you found this person).",
    "Rules:",
    "- Only give a work email if it is written on a public page you found, and give that page as source_url. Never guess or build an email from a name pattern (such as firstname.lastname@company.com); use null instead.",
    "- Only give a phone number if it is published for that person; otherwise null.",
    "- Only real people who work at this company now. No guessing. If you find nobody, reply with [].",
    'Reply with only a JSON array, up to 6 items: [{"name":"","role":"","email":null,"phone":null,"linkedin_url":null,"source_url":""}]',
  ].join("\n");
  const rows = parseJsonArray(await webSearchText(input, "People search"));

  // Each source page is read once to check the emails it is said to show (never LinkedIn)
  const pages = new Map<string, Promise<string | null>>();
  const pageText = (url: string) => {
    if (!pages.has(url)) pages.set(url, fetchText(url).catch(() => null));
    return pages.get(url)!;
  };
  const names = new Set<string>();
  const emails = new Set<string>();
  const out: FoundPerson[] = [];
  for (const row of rows.slice(0, 10)) {
    const name = clean(row?.name, 100);
    if (!name || !looksLikePerson(name)) continue;
    const key = personKey(name);
    if (names.has(key)) continue;
    const role = clean(row?.role, 120);
    const sourceUrl = isHttpUrl(clean(row?.source_url, 400));
    const linkedinUrl = linkedinLink(clean(row?.linkedin_url, 300), "in");
    // Someone we can't show a source for isn't kept
    if (!sourceUrl && !linkedinUrl) continue;

    let email = clean(row?.email, 120)?.toLowerCase();
    if (email && (emailsIn(email)[0] !== email || JUNK_EMAIL.test(email) || !sourceUrl || isLinkedIn(sourceUrl))) email = undefined;
    if (email && sourceUrl) {
      // Kept only when the page shows it; when the page can't be read (blocked, a PDF), only on the
      // company's own domain
      const html = await pageText(sourceUrl);
      if (html ? !pageEmails(html).includes(email) : !emailOnDomain(email, lead.domain ?? undefined)) email = undefined;
    }
    if (email && emails.has(email)) email = undefined;
    let phone = clean(row?.phone, 40);
    if (phone && (!sourceUrl || phoneKey(phone).length < 7)) phone = undefined;

    names.add(key);
    if (email) emails.add(email);
    out.push({ name, role, roleGroup: roleGroupOf(role), email, phone, linkedinUrl, sourceUrl: sourceUrl ?? linkedinUrl });
  }
  return out.slice(0, 8);
}

export const leadForPeople = internalQuery({
  args: { leadId: v.id("outreachLeads") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.kind !== "employer") return null;
    return { name: lead.name, city: lead.city, country: lead.country ?? null, website: lead.website ?? null, domain: lead.domain ?? null };
  },
});

/**
 * "Find people" for one company or up to ten: queued here and searched one company at a time
 * (runPeopleSearch), so a long run never hits an action's time limit. A company searched in the
 * last 7 days is skipped unless the team asks again (each search costs).
 */
export const adminFindPeople = mutation({
  args: { leadIds: v.array(v.id("outreachLeads")), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerOutreach:adminFindPeople");
    const ids = [...new Set(args.leadIds)];
    if (ids.length === 0) throw new ConvexError("Choose at least one company.");
    if (ids.length > MAX_PEOPLE_RUN) throw new ConvexError(`Find people for up to ${MAX_PEOPLE_RUN} companies at a time.`);
    if (!process.env.OPENAI_API_KEY) throw new ConvexError("Add OPENAI_API_KEY on Convex first.");
    const now = Date.now();
    const queued: Id<"outreachLeads">[] = [];
    let skipped = 0;
    for (const id of ids) {
      const lead = await ctx.db.get(id);
      if (!lead || lead.kind !== "employer" || lead.stage === "do_not_contact") {
        skipped++;
        continue;
      }
      const running = lead.peopleQueuedAt && now - lead.peopleQueuedAt < 30 * 60 * 1000;
      const recent = lead.peopleSearchedAt && now - lead.peopleSearchedAt < PEOPLE_SEARCH_COOLDOWN_MS;
      if (running || (recent && !args.force)) {
        skipped++;
        continue;
      }
      await ctx.db.patch(id, { peopleQueuedAt: now, peopleSearchError: undefined });
      queued.push(id);
    }
    if (queued.length) await ctx.scheduler.runAfter(0, runPeopleRef, { leadIds: queued, by: user._id });
    return { queued: queued.length, skipped };
  },
});

/** One company per run, then the next one is scheduled. */
export const runPeopleSearch = internalAction({
  args: { leadIds: v.array(v.id("outreachLeads")), by: v.id("users") },
  handler: async (ctx, args) => {
    const [leadId, ...rest] = args.leadIds;
    if (!leadId) return null;
    try {
      const lead = await ctx.runQuery(peopleLeadRef, { leadId });
      if (lead) {
        const people = await findPeopleAt(lead);
        await ctx.runMutation(savePeopleRef, { leadId, people, by: args.by });
      }
    } catch (err) {
      await ctx.runMutation(peopleFailedRef, { leadId, error: err instanceof Error ? err.message : "The search didn't work" });
    }
    if (rest.length) await ctx.scheduler.runAfter(1_000, runPeopleRef, { leadIds: rest, by: args.by });
    return null;
  },
});

const foundPersonValidator = v.object({
  name: v.string(),
  role: v.optional(v.string()),
  roleGroup: roleGroupValidator,
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
});

export const savePeople = internalMutation({
  args: { leadId: v.id("outreachLeads"), people: v.array(foundPersonValidator), by: v.id("users") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.kind !== "employer") return { added: 0 };
    const now = Date.now();
    const existing = await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(200);
    const byName = new Map(existing.map((p) => [personKey(p.name), p]));
    const emails = new Set(existing.flatMap((p) => (p.email ? [p.email] : [])));
    const added: string[] = [];
    for (const p of args.people) {
      const email = p.email && !emails.has(p.email) ? p.email : undefined;
      const known = byName.get(personKey(p.name));
      if (known) {
        // Someone we have: only fill what's missing
        const patch: Partial<Person> = {};
        if (!known.email && email) Object.assign(patch, { email, emailStatus: "published" as const, sourceUrl: known.sourceUrl ?? p.sourceUrl });
        if (!known.phone && p.phone) patch.phone = p.phone;
        if (!known.linkedinUrl && p.linkedinUrl) patch.linkedinUrl = p.linkedinUrl;
        if (!known.role && p.role) Object.assign(patch, { role: p.role, roleGroup: p.roleGroup });
        if (Object.keys(patch).length) await ctx.db.patch(known._id, { ...patch, updatedAt: now });
        if (email) emails.add(email);
        continue;
      }
      const blocked = email ? await emailDoNotContact(ctx, email) : false;
      await ctx.db.insert("outreachContacts", {
        leadId: lead._id,
        name: p.name,
        role: p.role,
        roleGroup: p.roleGroup,
        email,
        emailStatus: email ? "published" : undefined,
        phone: p.phone,
        linkedinUrl: p.linkedinUrl,
        source: "web_search",
        sourceUrl: p.sourceUrl,
        doNotContact: blocked || undefined,
        addedBy: args.by,
        createdAt: now,
      });
      if (email) emails.add(email);
      added.push(p.role ? `${p.name} (${p.role})` : p.name);
    }
    await ctx.db.patch(lead._id, { peopleSearchedAt: now, peopleQueuedAt: undefined, peopleSearchError: undefined, updatedAt: now });
    if (added.length) {
      await logActivity(ctx, lead._id, "contact_added", `Found ${added.length === 1 ? "1 person" : `${added.length} people`}: ${added.join(", ")}`);
      await autoAdvanceStage(ctx, lead._id, "contacts_found", "people found");
    } else {
      await logActivity(ctx, lead._id, "contact_added", "Find people: nobody new with a public source");
    }
    return { added: added.length };
  },
});

export const peopleSearchFailed = internalMutation({
  args: { leadId: v.id("outreachLeads"), error: v.string() },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (lead) await ctx.db.patch(lead._id, { peopleQueuedAt: undefined, peopleSearchError: args.error.slice(0, 200), updatedAt: Date.now() });
    return null;
  },
});

// ─── The list and one company ────────────────────────────────────────────────

/** Every company, the pipeline counts and what the finders can do. Filters run on the page. */
export const adminCompanies = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "employerOutreach:adminCompanies");
    const now = Date.now();
    const leads = await ctx.db
      .query("outreachLeads")
      .withIndex("by_kind_stage", (q) => q.eq("kind", "employer"))
      .take(MAX_COMPANIES);
    leads.sort((a, b) => b.updatedAt - a.updatedAt);
    const ids = new Set(leads.map((l) => l._id));
    // People per company in one read (the table only holds people at these companies)
    const peopleByLead = new Map<string, Person[]>();
    for (const p of await ctx.db.query("outreachContacts").take(8000)) {
      if (!ids.has(p.leadId)) continue;
      const list = peopleByLead.get(p.leadId) ?? [];
      list.push(p);
      peopleByLead.set(p.leadId, list);
    }

    const counts: Record<string, number> = {};
    const cities = new Map<string, number>();
    let pipelineValue = 0;
    for (const lead of leads) {
      const stage = lead.stage ?? "found";
      counts[stage] = (counts[stage] ?? 0) + 1;
      if (lead.city) cities.set(lead.city, (cities.get(lead.city) ?? 0) + 1);
      if ((stage === "pilot_live" || stage === "paying") && lead.dealValueNaira) pipelineValue += lead.dealValueNaira;
    }
    const searches = await ctx.db.query("outreachSearches").withIndex("by_kind", (q) => q.eq("kind", "employer")).order("desc").take(12);
    return {
      companies: leads.map((l) => {
        const people = peopleByLead.get(l._id) ?? [];
        return {
          _id: l._id,
          name: l.name,
          city: l.city,
          sector: l.sector ?? null,
          staffSize: l.staffSize ?? null,
          website: l.website ?? null,
          email: l.email ?? null,
          phone: l.phone ?? null,
          extraPhones: (l.otherPhones ?? []).length,
          linkedinUrl: l.linkedinUrl ?? null,
          status: l.status,
          stage: (l.stage ?? "found") as EmployerStage,
          nextFollowUpAt: l.nextFollowUpAt ?? null,
          ownerId: l.ownerId ?? null,
          dealValueNaira: l.dealValueNaira ?? null,
          crawlStatus: l.crawlStatus ?? null,
          peopleSearchedAt: l.peopleSearchedAt ?? null,
          peopleRunning: Boolean(l.peopleQueuedAt && now - l.peopleQueuedAt < 30 * 60 * 1000),
          peopleSearchError: l.peopleSearchError ?? null,
          contactsEnrichedAt: l.contactsEnrichedAt ?? null,
          contactsRunning: Boolean(l.contactsQueuedAt && now - l.contactsQueuedAt < 30 * 60 * 1000),
          people: {
            count: people.length,
            withEmail: people.filter((p) => p.email && !p.doNotContact).length,
            // Emails that may go into a sequence now (checked, or trusted as typed or published)
            sendable: people.filter((p) => emailSendable(p)).length,
            groups: [...new Set(people.map((p) => p.roleGroup))],
          },
          source: l.source,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
        };
      }),
      total: leads.length,
      capped: leads.length >= MAX_COMPANIES,
      counts,
      pipelineValue,
      cities: [...cities.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      owners: await adminNames(ctx),
      finders: { googlePlaces: Boolean(process.env.GOOGLE_PLACES_API_KEY), aiSearch: Boolean(process.env.OPENAI_API_KEY) },
      searches: searches.map((s) => ({
        city: s.city,
        sector: s.sectors?.[0] ?? null,
        source: s.source,
        found: s.found,
        added: s.added,
        error: s.error ?? null,
        at: s.createdAt,
      })),
      crawling: leads.filter((l) => l.crawlStatus === "pending").length,
    };
  },
});

/** One company's drawer: details, people, timeline, emails and replies. */
export const adminCompany = query({
  args: { leadId: v.id("outreachLeads") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "employerOutreach:adminCompany");
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.kind !== "employer") return null;
    const people = await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(200);
    const activities = await ctx.db.query("outreachActivities").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).order("desc").take(100);
    const enrollments = await ctx.db.query("outreachEnrollments").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(50);
    const inbox = await ctx.db.query("outreachInbox").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(50);
    const sequenceNames = new Map<string, string>();
    for (const e of enrollments) {
      if (!sequenceNames.has(e.sequenceId)) sequenceNames.set(e.sequenceId, (await ctx.db.get(e.sequenceId))?.name ?? "Sequence");
    }
    const userNames = new Map((await adminNames(ctx)).map((a) => [a._id as string, a.name]));
    const personName = new Map(people.map((p) => [p._id as string, p.name]));
    return {
      _id: lead._id,
      name: lead.name,
      city: lead.city,
      country: lead.country ?? null,
      address: lead.address ?? null,
      sector: lead.sector ?? null,
      staffSize: lead.staffSize ?? null,
      website: lead.website ?? null,
      email: lead.email ?? null,
      otherEmails: lead.otherEmails ?? [],
      phone: lead.phone ?? null,
      otherPhones: lead.otherPhones ?? [],
      linkedinUrl: lead.linkedinUrl ?? null,
      mapsUrl: lead.mapsUrl ?? null,
      sourceUrl: lead.sourceUrl ?? null,
      source: lead.source,
      status: lead.status,
      crawlStatus: lead.crawlStatus ?? null,
      crawlError: lead.crawlError ?? null,
      stage: (lead.stage ?? "found") as EmployerStage,
      stageChangedAt: lead.stageChangedAt ?? null,
      nextFollowUpAt: lead.nextFollowUpAt ?? null,
      ownerId: lead.ownerId ?? null,
      dealStaffCount: lead.dealStaffCount ?? null,
      dealValueNaira: lead.dealValueNaira ?? null,
      fromPilotRequest: Boolean(lead.sourceInquiryId),
      peopleSearchedAt: lead.peopleSearchedAt ?? null,
      peopleRunning: Boolean(lead.peopleQueuedAt && Date.now() - lead.peopleQueuedAt < 30 * 60 * 1000),
      peopleSearchError: lead.peopleSearchError ?? null,
      // Find contacts (employerContacts.ts)
      emailPattern: lead.emailPattern ?? null,
      contactsEnrichedAt: lead.contactsEnrichedAt ?? null,
      contactsRunning: Boolean(lead.contactsQueuedAt && Date.now() - lead.contactsQueuedAt < 30 * 60 * 1000),
      contactsEnrichError: lead.contactsEnrichError ?? null,
      enrichResults: lead.enrichResults ?? [],
      people: people
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((p) => ({
          _id: p._id,
          name: p.name,
          role: p.role ?? null,
          roleGroup: p.roleGroup,
          email: p.email ?? null,
          emailStatus: p.emailStatus ?? null,
          verifyStatus: p.verifyStatus ?? null,
          verifiedBy: p.verifiedBy ?? null,
          verifiedAt: p.verifiedAt ?? null,
          sendAnyway: p.sendAnyway === true,
          sendable: emailSendable(p),
          confidence: p.confidence ?? null,
          suggestedEmail: p.suggestedEmail ?? null,
          nameIncomplete: p.nameIncomplete === true,
          phone: p.phone ?? null,
          linkedinUrl: p.linkedinUrl ?? null,
          source: p.source,
          sourceUrl: p.sourceUrl ?? null,
          notes: p.notes ?? null,
          doNotContact: p.doNotContact === true,
          bounced: Boolean(p.bouncedAt),
        })),
      activities: activities.map((a) => ({
        _id: a._id,
        kind: a.kind,
        text: a.text,
        by: a.byUserId ? (userNames.get(a.byUserId) ?? "Admin") : null,
        at: a.at,
      })),
      enrollments: enrollments
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((e) => ({
          _id: e._id,
          sequenceName: sequenceNames.get(e.sequenceId) ?? "Sequence",
          email: e.email,
          personName: e.contactId ? (personName.get(e.contactId) ?? "Removed person") : null,
          status: e.status,
          sentSteps: e.nextStep,
          nextSendAt: e.nextSendAt ?? null,
          lastSentAt: e.lastSentAt ?? null,
          stoppedReason: e.stoppedReason ?? null,
        })),
      inbox: inbox
        .sort((a, b) => b.receivedAt - a.receivedAt)
        .map((i) => ({
          _id: i._id,
          kind: i.kind,
          intent: i.intent ?? null,
          fromEmail: i.fromEmail ?? null,
          subject: i.subject,
          snippet: i.snippet,
          receivedAt: i.receivedAt,
        })),
    };
  },
});

// ─── The team's edits ────────────────────────────────────────────────────────

/** Moves a company to a stage. "Do not contact" stops its emails and marks its addresses so. */
async function setStage(ctx: MutationCtx, lead: Lead, stage: EmployerStage, userId: Id<"users">) {
  const from = lead.stage ?? "found";
  if (from === stage) return false;
  const now = Date.now();
  const patch: Partial<Lead> = { stage, stageChangedAt: now, updatedAt: now };
  if (stage === "do_not_contact") patch.status = "do_not_contact";
  // Undoing a mistaken "Do not contact" frees the company's own address again (people stay as set)
  else if (from === "do_not_contact" && lead.status === "do_not_contact") patch.status = lead.email ? "ready" : "new";
  await ctx.db.patch(lead._id, patch);
  await logActivity(ctx, lead._id, "stage", `${STAGE_LABEL[from]} → ${STAGE_LABEL[stage]}`, userId);
  if (stage === "do_not_contact") {
    // Its own address on any other list, as clinic outreach does
    if (lead.email) {
      for (const other of await ctx.db.query("outreachLeads").withIndex("by_email", (q) => q.eq("email", lead.email)).take(20)) {
        if (other._id !== lead._id && other.status !== "do_not_contact") await ctx.db.patch(other._id, { status: "do_not_contact", updatedAt: now });
      }
    }
    for (const p of await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(200)) {
      if (!p.doNotContact) await ctx.db.patch(p._id, { doNotContact: true, updatedAt: now });
    }
    for (const e of await ctx.db.query("outreachEnrollments").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(200)) {
      if (e.status === "active") await stopEnrollment(ctx, e, "stopped", "Marked do not contact");
    }
  }
  return true;
}

const optionalNumber = v.optional(v.union(v.number(), v.null()));

/** The drawer's edits: stage, follow-up, owner, deal, and the company's own details. */
export const adminUpdateCompany = mutation({
  args: {
    leadId: v.id("outreachLeads"),
    stage: v.optional(stageValidator),
    nextFollowUpAt: optionalNumber,
    ownerId: v.optional(v.union(v.id("users"), v.null())),
    dealStaffCount: optionalNumber,
    dealValueNaira: optionalNumber,
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    sector: v.optional(v.string()),
    staffSize: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerOutreach:adminUpdateCompany");
    const lead = await employerLead(ctx, args.leadId);
    const now = Date.now();
    const patch: Partial<Lead> = {};
    if (args.nextFollowUpAt !== undefined) patch.nextFollowUpAt = args.nextFollowUpAt ?? undefined;
    if (args.ownerId !== undefined) {
      if (args.ownerId) {
        const owner = await ctx.db.get(args.ownerId);
        if (!owner || owner.role !== "admin") throw new ConvexError("Choose an admin as the owner.");
      }
      patch.ownerId = args.ownerId ?? undefined;
    }
    const amount = (value: number | null, max: number) => (value === null ? undefined : Math.max(0, Math.min(max, Math.round(value))));
    if (args.dealStaffCount !== undefined) patch.dealStaffCount = amount(args.dealStaffCount, 1_000_000);
    if (args.dealValueNaira !== undefined) patch.dealValueNaira = amount(args.dealValueNaira, 10_000_000_000);
    if (args.name !== undefined) {
      const name = clean(args.name, 150);
      if (!name) throw new ConvexError("The company needs a name.");
      patch.name = name;
    }
    if (args.city !== undefined) patch.city = clean(args.city, 80) ?? "";
    if (args.sector !== undefined) patch.sector = sectorByKey(args.sector) ? args.sector : undefined;
    if (args.staffSize !== undefined) patch.staffSize = clean(args.staffSize, 40);
    if (args.phone !== undefined) patch.phone = clean(args.phone, 40);
    if (args.linkedinUrl !== undefined) {
      const url = clean(args.linkedinUrl, 300);
      if (url && !isHttpUrl(url)) throw new ConvexError("Paste the full LinkedIn link, starting with https://");
      patch.linkedinUrl = url;
    }
    if (args.website !== undefined) {
      const website = clean(args.website, 300);
      patch.website = website;
      patch.domain = domainOf(website);
      if (website && website !== lead.website) Object.assign(patch, { crawlStatus: "pending" as const, crawlError: undefined });
    }
    let newEmail = false;
    if (args.email !== undefined) {
      const email = cleanEmail(args.email);
      patch.email = email;
      patch.emailSource = email ? "admin" : undefined;
      newEmail = Boolean(email && email !== lead.email);
      if (email && (lead.status === "new" || lead.status === "no_email" || (lead.status === "bounced" && newEmail))) patch.status = "ready";
      if (email && (await emailDoNotContact(ctx, email))) patch.status = "do_not_contact";
    }
    if (patch.name !== undefined || patch.city !== undefined) patch.nameKey = companyKey(patch.name ?? lead.name, patch.city ?? lead.city);
    if (Object.keys(patch).length) await ctx.db.patch(lead._id, { ...patch, updatedAt: now });
    if (args.nextFollowUpAt !== undefined && args.nextFollowUpAt !== (lead.nextFollowUpAt ?? null)) {
      const when = args.nextFollowUpAt ? new Date(args.nextFollowUpAt + 3_600_000).toISOString().slice(0, 10) : null;
      await logActivity(ctx, lead._id, "note", when ? `Follow-up set for ${when}` : "Follow-up cleared", user._id);
    }
    if (args.ownerId !== undefined && (args.ownerId ?? undefined) !== lead.ownerId) {
      const name = args.ownerId ? (await adminNames(ctx)).find((a) => a._id === args.ownerId)?.name : null;
      await logActivity(ctx, lead._id, "note", name ? `Owner: ${name}` : "Owner cleared", user._id);
    }
    if (args.stage) await setStage(ctx, (await ctx.db.get(lead._id))!, args.stage, user._id);
    if (newEmail) await autoAdvanceStage(ctx, lead._id, "contacts_found", "email added by the team");
    if (patch.crawlStatus === "pending") await ctx.scheduler.runAfter(0, crawlRef, {});
    return null;
  },
});

/** Bulk: one stage for the chosen companies. */
export const adminSetStage = mutation({
  args: { leadIds: v.array(v.id("outreachLeads")), stage: stageValidator },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerOutreach:adminSetStage");
    if (args.leadIds.length > 300) throw new ConvexError("Choose up to 300 companies at a time.");
    let changed = 0;
    for (const id of new Set(args.leadIds)) {
      const lead = await ctx.db.get(id);
      if (lead?.kind === "employer" && (await setStage(ctx, lead, args.stage, user._id))) changed++;
    }
    return { changed };
  },
});

export const adminAddNote = mutation({
  args: { leadId: v.id("outreachLeads"), text: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerOutreach:adminAddNote");
    const lead = await employerLead(ctx, args.leadId);
    const text = args.text.trim().slice(0, 600);
    if (!text) throw new ConvexError("Write the note first.");
    await logActivity(ctx, lead._id, "note", text, user._id);
    await ctx.db.patch(lead._id, { updatedAt: Date.now() });
    return null;
  },
});

/** Reads the company's website again (after the team fixed the address, or it was down). */
export const adminRecrawl = mutation({
  args: { leadId: v.id("outreachLeads") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "employerOutreach:adminRecrawl");
    const lead = await employerLead(ctx, args.leadId);
    if (!lead.website) throw new ConvexError("Add the company's website first.");
    await ctx.db.patch(lead._id, { domain: domainOf(lead.website), crawlStatus: "pending", crawlError: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, crawlRef, {});
    return null;
  },
});

/** Adds or edits a person by hand. Turning on "do not contact" stops anything being sent to them. */
export const adminSaveContact = mutation({
  args: {
    leadId: v.id("outreachLeads"),
    contactId: v.optional(v.id("outreachContacts")),
    name: v.string(),
    role: v.optional(v.string()),
    roleGroup: v.optional(roleGroupValidator),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    doNotContact: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerOutreach:adminSaveContact");
    const lead = await employerLead(ctx, args.leadId);
    const name = clean(args.name, 100);
    if (!name) throw new ConvexError("Type the person's name.");
    const role = clean(args.role, 120);
    const email = cleanEmail(args.email);
    const linkedinUrl = clean(args.linkedinUrl, 300);
    if (linkedinUrl && !isHttpUrl(linkedinUrl)) throw new ConvexError("Paste the full LinkedIn link, starting with https://");
    const now = Date.now();
    const atCompany = await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(200);
    if (email) {
      const twin = atCompany.find((p) => p.email === email && p._id !== args.contactId);
      if (twin) throw new ConvexError(`${twin.name} already has that email.`);
    }
    const fields = {
      name,
      role,
      roleGroup: args.roleGroup ?? roleGroupOf(role),
      phone: clean(args.phone, 40),
      linkedinUrl,
      notes: clean(args.notes, 500),
    };
    let contactId = args.contactId;
    if (contactId) {
      const person = await ctx.db.get(contactId);
      if (!person || person.leadId !== lead._id) throw new ConvexError("That person isn't on this company any more.");
      const emailChanged = (email ?? undefined) !== person.email;
      await ctx.db.patch(person._id, {
        ...fields,
        // A new address is the team's own: the old check, "send anyway" and any guess no longer apply
        ...(emailChanged
          ? {
              email,
              emailStatus: email ? ("admin" as const) : undefined,
              bouncedAt: undefined,
              verifyStatus: undefined,
              verifiedBy: undefined,
              verifiedAt: undefined,
              sendAnyway: undefined,
              confidence: undefined,
              suggestedEmail: email ? undefined : person.suggestedEmail,
            }
          : {}),
        ...(args.doNotContact !== undefined ? { doNotContact: args.doNotContact || undefined } : {}),
        updatedAt: now,
      });
      if (args.doNotContact && !person.doNotContact) await logActivity(ctx, lead._id, "note", `${name}: do not contact`, user._id);
    } else {
      const blocked = email ? await emailDoNotContact(ctx, email) : false;
      contactId = await ctx.db.insert("outreachContacts", {
        leadId: lead._id,
        ...fields,
        email,
        emailStatus: email ? "admin" : undefined,
        source: "admin",
        doNotContact: args.doNotContact || blocked || undefined,
        addedBy: user._id,
        createdAt: now,
      });
      await logActivity(ctx, lead._id, "contact_added", `Added ${role ? `${name} (${role})` : name}`, user._id);
      await autoAdvanceStage(ctx, lead._id, "contacts_found", "person added by the team");
    }
    if (args.doNotContact) {
      for (const e of await ctx.db.query("outreachEnrollments").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(200)) {
        if (e.contactId === contactId && e.status === "active") await stopEnrollment(ctx, e, "stopped", "Marked do not contact");
      }
    }
    await ctx.db.patch(lead._id, { updatedAt: now });
    return contactId;
  },
});

/** Removes a person. Someone marked "do not contact" stays, so they're never emailed again. */
export const adminDeleteContact = mutation({
  args: { contactId: v.id("outreachContacts") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerOutreach:adminDeleteContact");
    const person = await ctx.db.get(args.contactId);
    if (!person) return null;
    if (person.doNotContact) throw new ConvexError("This person asked not to be contacted. Keep them, so they're never emailed again.");
    for (const e of await ctx.db.query("outreachEnrollments").withIndex("by_lead", (q) => q.eq("leadId", person.leadId)).take(200)) {
      if (e.contactId === person._id && e.status === "active") await stopEnrollment(ctx, e, "stopped", "The person was removed");
    }
    await ctx.db.delete(person._id);
    await logActivity(ctx, person.leadId, "note", `Removed ${person.name}`, user._id);
    return null;
  },
});

// ─── Emails (the clinic outreach sender) ─────────────────────────────────────

const stepValidator = v.object({ subject: v.string(), body: v.string(), waitDays: v.number() });

/** Employer sequences, their numbers, the shared sender and the latest replies from companies. */
export const adminSequences = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx, "employerOutreach:adminSequences");
    const sequences = (await ctx.db.query("outreachSequences").order("desc").take(200)).filter((q) => q.audience === "employer");
    const ids = new Set<string>(sequences.map((q) => q._id));
    // Every employer enrollment read below, for the headline numbers (outreachNumbers)
    const everyEnrollment: Doc<"outreachEnrollments">[] = [];
    const stats = async (sequenceId: Id<"outreachSequences">) => {
      const rows = await ctx.db.query("outreachEnrollments").withIndex("by_sequence", (q) => q.eq("sequenceId", sequenceId)).take(3000);
      everyEnrollment.push(...rows);
      const out = { total: rows.length, active: 0, finished: 0, replied: 0, bounced: 0, unsubscribed: 0, stopped: 0, sent: 0, contacted: 0, people: 0 };
      for (const e of rows) {
        out[e.status]++;
        out.sent += e.nextStep;
        if (e.nextStep > 0) out.contacted++;
        if (e.contactId) out.people++;
      }
      return out;
    };
    const sender = await senderSummary(ctx);
    const today = await ctx.db.query("outreachMessages").withIndex("by_day", (q) => q.eq("day", sender.day)).take(1000);
    const sequenceRows = await Promise.all(
      sequences.map(async (q) => ({ _id: q._id, name: q.name, status: q.status, steps: q.steps, updatedAt: q.updatedAt, stats: await stats(q._id) }))
    );
    // Enough inbox rows to count every reply and bounce; the list shows the newest from companies
    const inboxAll = await ctx.db.query("outreachInbox").order("desc").take(1500);
    const employerEnrollmentIds = new Set<string>(everyEnrollment.map((e) => e._id));
    const employerInbox = inboxAll.filter((i) => employerEnrollmentIds.has(i.enrollmentId));
    const replies: { _id: Id<"outreachInbox">; leadId: Id<"outreachLeads">; company: string; kind: string; intent: string | null; fromEmail: string | null; subject: string; snippet: string; receivedAt: number }[] = [];
    for (const i of employerInbox) {
      if (replies.length >= 20) break;
      const lead = await ctx.db.get(i.leadId);
      if (lead?.kind !== "employer") continue;
      replies.push({ _id: i._id, leadId: i.leadId, company: lead.name, kind: i.kind, intent: i.intent ?? null, fromEmail: i.fromEmail ?? null, subject: i.subject, snippet: i.snippet, receivedAt: i.receivedAt });
    }
    return {
      sender,
      employerSentToday: today.filter((m) => ids.has(m.sequenceId)).length,
      sequences: sequenceRows,
      replies,
      numbers: outreachNumbers(everyEnrollment, employerInbox),
      repliesTotal: employerInbox.length,
    };
  },
});

export const adminSaveSequence = mutation({
  args: {
    sequenceId: v.optional(v.id("outreachSequences")),
    name: v.string(),
    steps: v.array(stepValidator),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("paused")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerOutreach:adminSaveSequence");
    return await saveSequence(ctx, user._id, args, "employer");
  },
});

/**
 * The name companies see the emails come from, the signature and the "reply stop" line. Only
 * employer emails use them; `useClinic` goes back to the Clinic outreach ones. The inbox, the
 * daily limit and the on/off switch stay shared (Clinic outreach page).
 */
export const adminSaveSender = mutation({
  args: {
    fromName: v.optional(v.string()),
    signature: v.optional(v.string()),
    optOut: v.optional(v.string()),
    useClinic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerOutreach:adminSaveSender");
    if (args.useClinic) {
      await saveEmployerSender(ctx, null, user._id);
      return null;
    }
    const fromName = (args.fromName ?? "").trim().slice(0, 60);
    const optOut = (args.optOut ?? "").trim().slice(0, 300);
    if (!fromName) throw new ConvexError("Type the name companies see the emails come from.");
    // The law and the inbox providers both expect a way to say no
    if (!optOut) throw new ConvexError("Keep a line telling companies how to stop the emails.");
    await saveEmployerSender(ctx, { fromName, signature: (args.signature ?? "").trim().slice(0, 500), optOut }, user._id);
    return null;
  },
});

/**
 * Adds the chosen companies to an employer sequence: the company's own address, its named people
 * with a usable email (optionally only some role groups), or both. An address is only ever added
 * once (whichever list added it), and "do not contact" always wins.
 */
export const adminEnroll = mutation({
  args: {
    sequenceId: v.id("outreachSequences"),
    leadIds: v.array(v.id("outreachLeads")),
    companyEmail: v.boolean(),
    people: v.boolean(),
    roleGroups: v.optional(v.array(roleGroupValidator)),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "employerOutreach:adminEnroll");
    const seq = await ctx.db.get(args.sequenceId);
    if (!seq || seq.audience !== "employer") throw new ConvexError("Choose an employer sequence.");
    if (!args.companyEmail && !args.people) throw new ConvexError("Choose company emails, named people or both.");
    if (args.leadIds.length > 300) throw new ConvexError("Choose up to 300 companies at a time.");
    const groups = args.roleGroups?.length ? new Set<string>(args.roleGroups) : null;
    const now = Date.now();
    let added = 0;
    let skipped = 0;
    let companies = 0;
    for (const id of new Set(args.leadIds)) {
      const lead = await ctx.db.get(id);
      if (!lead || lead.kind !== "employer" || CLOSED_STATUS.has(lead.status) || stageStopsEmails(lead.stage)) {
        skipped++;
        continue;
      }
      const targets: { email: string; contactId?: Id<"outreachContacts"> }[] = [];
      if (args.companyEmail && lead.email && lead.status !== "bounced") targets.push({ email: lead.email });
      if (args.people) {
        for (const p of await ctx.db.query("outreachContacts").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).take(50)) {
          // Only emails cleared to send: checked "valid", "send anyway" ticked, or typed / published
          if (emailSendable(p) && !p.bouncedAt && (!groups || groups.has(p.roleGroup))) targets.push({ email: p.email!, contactId: p._id });
        }
      }
      let any = false;
      for (const t of targets) {
        const taken = await ctx.db.query("outreachEnrollments").withIndex("by_email", (q) => q.eq("email", t.email)).first();
        if (taken || (await emailDoNotContact(ctx, t.email))) continue;
        await ctx.db.insert("outreachEnrollments", {
          sequenceId: seq._id,
          leadId: lead._id,
          ...(t.contactId ? { contactId: t.contactId } : {}),
          email: t.email,
          status: "active",
          nextStep: 0,
          nextSendAt: now + added, // keeps the order they were added in
          enrolledBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
        added++;
        any = true;
      }
      if (!any) skipped++;
      else {
        companies++;
        await logActivity(ctx, lead._id, "note", `Added to "${seq.name}"`, user._id);
      }
    }
    return { added, companies, skipped };
  },
});

/** Takes one address out of its employer sequence (nothing more is sent to it). */
export const adminStopEnrollment = mutation({
  args: { enrollmentId: v.id("outreachEnrollments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "employerOutreach:adminStopEnrollment");
    const e = await ctx.db.get(args.enrollmentId);
    if (!e) throw new ConvexError("That email isn't in a sequence any more.");
    const lead = await ctx.db.get(e.leadId);
    if (lead?.kind !== "employer") throw new ConvexError("That's a clinic: manage it in Clinic outreach.");
    if (e.status === "active") await stopEnrollment(ctx, e, "stopped", "Removed by the team");
    return null;
  },
});

// ─── Export ──────────────────────────────────────────────────────────────────

/** Companies with their people as CSV rows: one row per person (or one per company without people). */
export const adminExport = query({
  args: { leadIds: v.optional(v.array(v.id("outreachLeads"))) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "employerOutreach:adminExport");
    // Two reads in all (companies, then people), however many companies are chosen
    const chosen = args.leadIds?.length ? new Set<string>(args.leadIds) : null;
    const leads = (await ctx.db.query("outreachLeads").withIndex("by_kind_stage", (q) => q.eq("kind", "employer")).take(MAX_COMPANIES)).filter(
      (l) => !chosen || chosen.has(l._id)
    );
    const ids = new Set<string>(leads.map((l) => l._id));
    const peopleByLead = new Map<string, Person[]>();
    for (const p of await ctx.db.query("outreachContacts").take(8000)) {
      if (ids.has(p.leadId)) peopleByLead.set(p.leadId, [...(peopleByLead.get(p.leadId) ?? []), p]);
    }
    const owners = new Map((await adminNames(ctx)).map((a) => [a._id as string, a.name]));
    const rows: Record<string, string>[] = [];
    for (const lead of leads) {
      const base = {
        company: lead.name,
        sector: lead.sector ? (EMPLOYER_SECTORS.find((s) => s.key === lead.sector)?.label ?? lead.sector) : "",
        city: lead.city,
        staff_size: lead.staffSize ?? "",
        stage: STAGE_LABEL[lead.stage ?? "found"],
        owner: lead.ownerId ? (owners.get(lead.ownerId) ?? "") : "",
        next_follow_up: lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt + 3_600_000).toISOString().slice(0, 10) : "",
        deal_staff: lead.dealStaffCount ? String(lead.dealStaffCount) : "",
        deal_value_naira_month: lead.dealValueNaira ? String(lead.dealValueNaira) : "",
        // "Do not contact" addresses are never exported
        company_email: lead.email && lead.status !== "do_not_contact" ? lead.email : "",
        company_phone: [lead.phone, ...(lead.otherPhones ?? [])].filter(Boolean).join(" / "),
        website: lead.website ?? "",
        company_linkedin: lead.linkedinUrl ?? "",
      };
      const people = peopleByLead.get(lead._id) ?? [];
      const blank = {
        person: "",
        role: "",
        role_group: "",
        person_email: "",
        email_check: "",
        person_phone: "",
        person_linkedin: "",
        found_by: "",
        person_source: "",
        do_not_contact: "",
      };
      if (people.length === 0) rows.push({ ...base, ...blank });
      for (const p of people) {
        rows.push({
          ...base,
          person: p.name,
          role: p.role ?? "",
          role_group: p.roleGroup,
          person_email: p.email && !p.doNotContact ? p.email : "",
          email_check: p.verifyStatus ?? (p.email ? "not checked" : ""),
          person_phone: p.phone ?? "",
          person_linkedin: p.linkedinUrl ?? "",
          found_by: p.source,
          person_source: p.sourceUrl ?? "",
          do_not_contact: p.doNotContact ? "yes" : "",
        });
      }
    }
    return { rows };
  },
});

// ─── Pilot requests from /platform/employers ─────────────────────────────────

/** The company of a pilot request: found by its email's domain or its name, else added at "Replied". */
async function pilotLead(ctx: MutationCtx, inquiry: Doc<"partnershipInquiries">): Promise<"linked" | "added" | "skipped"> {
  const email = inquiry.email.trim().toLowerCase();
  // Already in the pipeline (the backfill can run more than once)
  const done = (await ctx.db.query("outreachContacts").withIndex("by_email", (q) => q.eq("email", email)).take(20)).some((p) => p.source === "pilot_form");
  if (done) return "skipped";
  const host = email.split("@")[1] ?? "";
  const domain = host && !FREE_MAIL.has(host) ? host : undefined;
  const core = companyCore(inquiry.organization);
  const byName = core
    ? await ctx.db
        .query("outreachLeads")
        .withIndex("by_name_key", (q) => q.gte("nameKey", `${core}|`).lt("nameKey", `${core}|\uffff`))
        .take(10)
    : [];
  let lead =
    (domain ? employerOf(await ctx.db.query("outreachLeads").withIndex("by_domain", (q) => q.eq("domain", domain)).take(5)) : null) ?? employerOf(byName);
  const now = Date.now();
  const workers = inquiry.workerCount && inquiry.workerCount > 0 ? inquiry.workerCount : undefined;
  let result: "linked" | "added" = "linked";
  if (!lead) {
    const id = await ctx.db.insert("outreachLeads", {
      kind: "employer",
      name: inquiry.organization,
      nameKey: companyKey(inquiry.organization, ""),
      city: "",
      country: "Nigeria",
      // A work email's domain is the company's website
      website: domain ? `https://${domain}` : undefined,
      domain,
      source: "pilot_form",
      status: "replied",
      crawlStatus: domain ? "pending" : undefined,
      staffSize: workers ? String(workers) : undefined,
      dealStaffCount: workers,
      stage: "replied",
      stageChangedAt: now,
      sourceInquiryId: inquiry._id,
      createdAt: now,
      updatedAt: now,
    });
    lead = (await ctx.db.get(id))!;
    result = "added";
    if (domain) await ctx.scheduler.runAfter(0, crawlRef, {});
  } else {
    const patch: Partial<Lead> = { updatedAt: now };
    // They asked us: any sequence to this company stops (as a reply would)
    if (lead.status !== "do_not_contact" && lead.status !== "on_rehabify") patch.status = "replied";
    if (!lead.sourceInquiryId) patch.sourceInquiryId = inquiry._id;
    if (!lead.dealStaffCount && workers) patch.dealStaffCount = workers;
    await ctx.db.patch(lead._id, patch);
  }
  await ctx.db.insert("outreachContacts", {
    leadId: lead._id,
    name: inquiry.name,
    role: inquiry.role,
    roleGroup: roleGroupOf(inquiry.role),
    email,
    emailStatus: "pilot_form",
    phone: inquiry.phone,
    source: "pilot_form",
    notes: inquiry.workType ? `Their work: ${inquiry.workType}`.slice(0, 500) : undefined,
    createdAt: now,
  });
  const who = [inquiry.name, inquiry.role].filter(Boolean).join(", ");
  await logActivity(
    ctx,
    lead._id,
    "reply",
    `Pilot request from the website: ${who}${workers ? `, ${workers.toLocaleString("en-NG")} workers` : ""}${inquiry.workType ? ` (${inquiry.workType})` : ""}`
  );
  if (result === "linked" && canAutoAdvance(lead.stage, "replied")) {
    await ctx.db.patch(lead._id, { stage: "replied", stageChangedAt: now });
    await logActivity(ctx, lead._id, "stage", `${STAGE_LABEL.replied}: pilot request`);
  }
  return result;
}

/** Scheduled by public:requestEmployerPilot for each new pilot request. */
export const pilotToPipeline = internalMutation({
  args: { inquiryId: v.id("partnershipInquiries") },
  handler: async (ctx, args) => {
    const inquiry = await ctx.db.get(args.inquiryId);
    if (inquiry?.kind === "employer_pilot") await pilotLead(ctx, inquiry);
    return null;
  },
});

/**
 * One-off: pilot requests that arrived before Employer outreach existed (run once from the Convex
 * dashboard after deploying; safe to run again).
 */
export const backfillPilotInquiries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts = { added: 0, linked: 0, skipped: 0 };
    const inquiries = await ctx.db.query("partnershipInquiries").withIndex("by_created").order("desc").take(1000);
    for (const inquiry of inquiries) {
      if (inquiry.kind !== "employer_pilot") continue;
      counts[await pilotLead(ctx, inquiry)]++;
    }
    return counts;
  },
});
