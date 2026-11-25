/**
 * Clinic outreach (owner, 16 Nov 2026): find physiotherapy clinics city by city, collect a contact
 * email from their own websites, and keep one list the team works through (Admin › Clinic outreach).
 *
 *  - Finding: Google Places Text Search when GOOGLE_PLACES_API_KEY is set (names, phones,
 *    websites), and an AI web search (OpenAI Responses + web_search, OPENAI_API_KEY) that also
 *    picks up emails clinics publish in directories and on social pages.
 *  - Emails: each website's home and contact pages are read for published addresses
 *    (crawlPending, a few sites per run).
 *  - Sending is in outreachSend.ts: one email at a time from the team's own Zoho inbox (never
 *    Rehabify's product domain on Resend, which would hurt receipts and reminders and isn't
 *    allowed there). The list also exports as CSV. "Do not contact" sticks to the email address.
 *  - Clinics already on Rehabify are marked and left out of exports.
 *  - Employer outreach (employerOutreach.ts) keeps its companies in the same table with kind
 *    "employer" and reuses the finders and the website reader here. Every clinic list below
 *    filters them out (isClinicLead), so clinics and companies never mix.
 */
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./helpers/partnerAccess";
import { autoAdvanceStage, clinicLeadsDesc, emailDoNotContact, isClinicLead } from "./helpers/outreachShared";

export type LeadStatus = Doc<"outreachLeads">["status"];
export type Candidate = {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  mapsUrl?: string;
  placeId?: string;
  rating?: number;
  reviews?: number;
  source: "google_places" | "web_search";
  sourceUrl?: string;
};

const statusValidator = v.union(
  v.literal("new"),
  v.literal("ready"),
  v.literal("no_email"),
  v.literal("exported"),
  v.literal("contacted"),
  v.literal("replied"),
  v.literal("not_interested"),
  v.literal("do_not_contact"),
  v.literal("on_rehabify"),
  v.literal("bounced")
);
/** Statuses that mean "leave this clinic alone": never exported again, never reset by a search */
const CLOSED: ReadonlySet<LeadStatus> = new Set(["do_not_contact", "not_interested", "on_rehabify", "replied", "bounced"]);
const CRAWL_BATCH = 6;
const FETCH_TIMEOUT_MS = 9_000;
const MAX_PAGE_CHARS = 600_000;
const USER_AGENT = "Mozilla/5.0 (compatible; RehabifyBot/1.0; +https://physioaroundme.com)";

// Own functions by name (the generated api type is at TypeScript's depth limit)
const guardRef = makeFunctionReference<"query", Record<string, never>, { adminId: Id<"users"> }>("outreach:adminGuard");
const upsertRef = makeFunctionReference<
  "mutation",
  { city: string; country: string; candidates: Candidate[]; by: Id<"users">; log: { source: string; found: number; error?: string }[] },
  { added: number; updated: number; skipped: number }
>("outreach:upsertLeads");
const pendingRef = makeFunctionReference<
  "query",
  { limit: number },
  { _id: Id<"outreachLeads">; website: string; employer: boolean }[]
>("outreach:pendingCrawl");
const saveCrawlRef = makeFunctionReference<
  "mutation",
  { leadId: Id<"outreachLeads">; emails: string[]; phones?: string[]; error?: string },
  null
>("outreach:saveCrawl");
const crawlRef = makeFunctionReference<"action", Record<string, never>, null>("outreach:crawlPending");

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const clean = (value: unknown, max = 200) =>
  typeof value === "string" && value.trim() && value.trim().toLowerCase() !== "null" ? value.trim().replace(/\s+/g, " ").slice(0, max) : undefined;

/** "D&H Physiotherapy Clinic Ltd." → "dhphysiotherapy": for spotting the same clinic twice. */
export function nameKey(name: string, city: string) {
  const core = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|ltd|limited|nig|nigeria|clinic|clinics|centre|center|services|and)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
  return `${core}|${city.trim().toLowerCase()}`;
}

const NOT_OWN_SITES = [
  "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "google.com", "g.page", "goo.gl",
  "business.site", "wa.me", "whatsapp.com", "tiktok.com", "youtube.com", "linktr.ee", "bit.ly",
];

export function domainOf(url: string | undefined) {
  if (!url) return undefined;
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
    // Social pages and link pages aren't the clinic's own domain
    if (NOT_OWN_SITES.some((site) => host === site || host.endsWith(`.${site}`))) return undefined;
    return host;
  } catch {
    return undefined;
  }
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
export const JUNK_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|^(your|name|email|user|example|test)@|@(example|domain|email|sentry|wixpress|sentry-next|yourdomain)\./i;

/** Published addresses in a page: mailto links and plain text, without image names and placeholders. */
export function emailsIn(html: string): string[] {
  // "bookings [at] clinic [dot] com" and HTML-encoded @ count too
  const text = html
    .replace(/&#64;|&commat;|\s*\[at\]\s*|\s*\(at\)\s*/gi, "@")
    .replace(/&#46;|\s*\[dot\]\s*|\s*\(dot\)\s*/gi, ".");
  const found = new Set<string>();
  for (const match of text.matchAll(EMAIL_RE)) {
    const email = match[0].toLowerCase().replace(/^mailto:/, "").replace(/\.+$/, "");
    if (!JUNK_EMAIL.test(email) && email.length <= 100) found.add(email);
  }
  return [...found];
}

/** The best address to write to: the clinic's own domain, then a general inbox (info@, contact@…). */
export function bestEmail(emails: string[], domain?: string): string | undefined {
  const score = (email: string) => {
    const [local, host] = email.split("@");
    let s = 0;
    if (domain && (host === domain || host.endsWith(`.${domain}`))) s += 4;
    if (/^(info|contact|hello|enquir|inquir|admin|office|reception|appointments?|bookings?|care)/.test(local)) s += 2;
    if (/^(no-?reply|noreply|privacy|abuse|webmaster|support@wix)/.test(local)) s -= 5;
    return s;
  };
  return [...emails].sort((a, b) => score(b) - score(a))[0];
}

/**
 * The best address at a company (employer outreach): its own domain first, then hr@, careers@,
 * people@ and info@ in that order, then other general inboxes.
 */
export function bestEmployerEmail(emails: string[], domain?: string): string | undefined {
  const score = (email: string) => {
    const [local, host] = email.split("@");
    let s = 0;
    if (domain && (host === domain || host.endsWith(`.${domain}`))) s += 10;
    if (/^(hr|human[._-]?resources?|humancapital)([._-]|$)/.test(local)) s += 6;
    else if (/^(careers?|jobs|recruit)/.test(local)) s += 5;
    else if (/^people/.test(local)) s += 4;
    else if (/^info/.test(local)) s += 3;
    else if (/^(contact|hello|enquir|inquir|admin|office|customer)/.test(local)) s += 2;
    if (/^(no-?reply|noreply|privacy|abuse|webmaster|dpo|support@wix)/.test(local)) s -= 20;
    return s;
  };
  return [...emails].sort((a, b) => score(b) - score(a))[0];
}

const TEL_LINK_RE = /href=["']tel:([^"']{6,40})["']/gi;
// Nigerian mobiles as written on websites: 0803 123 4567, +234 803 123 4567, +234 (0) 803…
const NG_MOBILE_RE = /(?:\+234[\s.-]?(?:\(0\)[\s.-]?)?|\b234[\s.-]?|\b0)[789][01]\d[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

/** The digits that identify a phone number, for spotting the same one written two ways. */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // +234 (0) 803… and 0803… are the same number
  return digits.startsWith("234") ? `0${digits.slice(3).replace(/^0/, "")}` : digits;
}

/** Published phone numbers in a page: tel: links first, then Nigerian mobiles in the text. */
export function phonesIn(html: string): string[] {
  const found = new Map<string, string>();
  const add = (raw: string) => {
    const phone = raw.replace(/%20/g, " ").replace(/[^\d+()\s.-]/g, "").replace(/\s+/g, " ").trim();
    const key = phoneKey(phone);
    if (key.length >= 7 && key.length <= 14 && !found.has(key)) found.set(key, phone);
  };
  for (const m of html.matchAll(TEL_LINK_RE)) add(m[1]);
  for (const m of html.matchAll(NG_MOBILE_RE)) add(m[0]);
  return [...found.values()].slice(0, 8);
}

export async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.5" }, redirect: "follow", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|text/i.test(type)) return "";
    return (await res.text()).slice(0, MAX_PAGE_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

/** The home page, then up to two "contact" / "about" pages on the same site. */
export async function crawlSite(website: string): Promise<string[]> {
  return (await readSite(website, /contact|about|reach|location|get-in-touch/i, 2)).emails;
}

/** A company's website (employer outreach): home, contact, careers and about pages; emails and phones. */
export async function crawlCompanySite(website: string): Promise<{ emails: string[]; phones: string[] }> {
  return await readSite(website, /contact|careers?|jobs|about|people|reach|get-in-touch/i, 3);
}

async function readSite(website: string, pagePattern: RegExp, extraPages: number): Promise<{ emails: string[]; phones: string[] }> {
  const start = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const home = await fetchText(start);
  const emails = new Set(emailsIn(home));
  const phones = new Set(phonesIn(home));
  const base = new URL(start);
  const links = [...home.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map((m) => m[1])
    .filter((href) => pagePattern.test(href))
    .map((href) => {
      try {
        return new URL(href, base).toString();
      } catch {
        return null;
      }
    })
    .filter((href): href is string => Boolean(href) && new URL(href!).hostname === base.hostname);
  for (const link of [...new Set(links)].slice(0, extraPages)) {
    try {
      const html = await fetchText(link);
      for (const email of emailsIn(html)) emails.add(email);
      for (const phone of phonesIn(html)) phones.add(phone);
    } catch {
      // A broken contact page shouldn't lose what the home page gave
    }
  }
  return { emails: [...emails], phones: [...phones] };
}

// ─── Finding clinics ─────────────────────────────────────────────────────────

/** Google Maps listings for each search phrase ("physiotherapy clinic in Ibadan, Nigeria"), up to 20 a page. */
export async function searchGooglePlaces(textQueries: string[], pages = 3): Promise<Candidate[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY isn't set on Convex.");
  const byId = new Map<string, Candidate>();
  for (const textQuery of textQueries) {
    let pageToken: string | undefined;
    for (let page = 0; page < pages; page++) {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus,nextPageToken",
        },
        body: JSON.stringify({ textQuery, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`Google Places: ${data?.error?.message ?? `HTTP ${res.status}`}`);
      for (const p of data?.places ?? []) {
        if (!p?.id || byId.has(p.id) || p.businessStatus === "CLOSED_PERMANENTLY") continue;
        const name = clean(p.displayName?.text, 150);
        if (!name) continue;
        byId.set(p.id, {
          name,
          address: clean(p.formattedAddress, 300),
          phone: clean(p.internationalPhoneNumber ?? p.nationalPhoneNumber, 40),
          website: clean(p.websiteUri, 300),
          mapsUrl: clean(p.googleMapsUri, 300),
          placeId: p.id,
          rating: typeof p.rating === "number" ? p.rating : undefined,
          reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : undefined,
          source: "google_places",
        });
      }
      pageToken = typeof data?.nextPageToken === "string" ? data.nextPageToken : undefined;
      if (!pageToken) break;
      // Google needs a moment before the next page token works
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }
  return [...byId.values()];
}

/** The model's answer text from a Responses API result. */
function responseText(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text;
  return (data?.output ?? [])
    .flatMap((item: any) => (item?.type === "message" ? item.content ?? [] : []))
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n");
}

/** The first JSON array in a text, tolerant of code fences and words around it. */
export function parseJsonArray(text: string): any[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * One OpenAI Responses call with web search (OPENAI_API_KEY, OUTREACH_AI_MODEL): the answer's
 * text. Finds clinics here, and companies and the people at them in employerOutreach.ts.
 */
export async function webSearchText(input: string, label = "AI search"): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY isn't set on Convex.");
  const model = process.env.OUTREACH_AI_MODEL?.trim() || "gpt-5-mini";
  let lastError = "";
  // "web_search" is the current tool name; older accounts only know the preview one
  for (const tool of ["web_search", "web_search_preview"]) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, tools: [{ type: tool }], input }),
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) {
      lastError = data?.error?.message ?? `HTTP ${res.status}`;
      if (res.status === 400 && /tool|web_search/i.test(lastError)) continue;
      throw new Error(`${label}: ${lastError}`);
    }
    return responseText(data);
  }
  throw new Error(`${label}: ${lastError}`);
}

async function searchWithAi(city: string, country: string): Promise<Candidate[]> {
  const input = [
    `Find physiotherapy clinics and private physiotherapy practices in ${city}, ${country}.`,
    "Search the web: clinic websites, Google Business listings, Facebook and Instagram pages, health directories.",
    "For each clinic give: name, address, phone, email, website, and source_url (the page where you found its details).",
    "Only include an email or phone you actually saw published for that clinic. Never guess or build one; use null instead.",
    "Leave out hospitals' general switchboards unless they run a named physiotherapy clinic.",
    'Reply with only a JSON array, up to 40 items: [{"name":"","address":null,"phone":null,"email":null,"website":null,"source_url":null}]',
  ].join("\n");
  const out: Candidate[] = [];
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
      sourceUrl: clean(row?.source_url, 300),
      source: "web_search",
    });
  }
  return out;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export const adminGuard = query({
  args: {},
  handler: async (ctx) => ({ adminId: (await requireAdmin(ctx, "outreach:adminGuard")).user._id }),
});

/** The list, its counts and which finders are switched on. */
export const adminLeads = query({
  args: { status: v.optional(statusValidator), city: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "outreach:adminLeads");
    // Clinics only: employer companies share the table (Admin › Employer outreach)
    const all = await clinicLeadsDesc(ctx, 3000);
    const counts: Record<string, number> = {};
    const cities = new Map<string, number>();
    for (const lead of all) {
      counts[lead.status] = (counts[lead.status] ?? 0) + 1;
      cities.set(lead.city, (cities.get(lead.city) ?? 0) + 1);
    }
    const leads = all
      .filter((l) => (!args.status || l.status === args.status) && (!args.city || l.city === args.city))
      .slice(0, 600)
      .map((l) => ({
        _id: l._id,
        name: l.name,
        city: l.city,
        address: l.address ?? null,
        phone: l.phone ?? null,
        email: l.email ?? null,
        otherEmails: l.otherEmails ?? [],
        website: l.website ?? null,
        mapsUrl: l.mapsUrl ?? null,
        rating: l.rating ?? null,
        reviews: l.reviews ?? null,
        source: l.source,
        sourceUrl: l.sourceUrl ?? null,
        status: l.status,
        crawlStatus: l.crawlStatus ?? null,
        note: l.note ?? null,
        exportedAt: l.exportedAt ?? null,
        createdAt: l.createdAt,
      }));
    const searches = await ctx.db.query("outreachSearches").withIndex("by_kind", (q) => q.eq("kind", undefined)).order("desc").take(10);
    return {
      leads,
      total: all.length,
      counts,
      cities: [...cities.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      finders: { googlePlaces: Boolean(process.env.GOOGLE_PLACES_API_KEY), aiSearch: Boolean(process.env.OPENAI_API_KEY) },
      searches: searches.map((s) => ({ city: s.city, source: s.source, found: s.found, added: s.added, error: s.error ?? null, at: s.createdAt })),
      crawling: all.filter((l) => l.crawlStatus === "pending").length,
    };
  },
});

/** Finds clinics in a city with the chosen finders, adds the new ones and starts reading their websites. */
export const adminFindClinics = action({
  args: {
    city: v.string(),
    country: v.optional(v.string()),
    sources: v.array(v.union(v.literal("google_places"), v.literal("web_search"))),
  },
  handler: async (ctx, args): Promise<{ found: number; added: number; updated: number; errors: string[] }> => {
    const { adminId } = await ctx.runQuery(guardRef, {});
    const city = clean(args.city, 80);
    const country = clean(args.country, 60) ?? "Nigeria";
    if (!city) throw new ConvexError("Type a city.");
    if (args.sources.length === 0) throw new ConvexError("Choose at least one way to search.");
    const candidates: Candidate[] = [];
    const errors: string[] = [];
    const log: { source: string; found: number; error?: string }[] = [];
    for (const source of args.sources) {
      try {
        const found =
          source === "google_places"
            ? await searchGooglePlaces([`physiotherapy clinic in ${city}, ${country}`, `physiotherapist in ${city}, ${country}`])
            : await searchWithAi(city, country);
        candidates.push(...found);
        log.push({ source, found: found.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(message);
        log.push({ source, found: 0, error: message.slice(0, 300) });
      }
    }
    const result = await ctx.runMutation(upsertRef, { city, country, candidates, by: adminId, log });
    await ctx.scheduler.runAfter(0, crawlRef, {});
    return { found: candidates.length, ...result, errors };
  },
});

/** Turns a clinic Rehabify already has into "on Rehabify" (by name in the city, or by email). */
async function onRehabify(ctx: MutationCtx, name: string, city: string, email?: string) {
  const key = nameKey(name, city);
  const clinics = await ctx.db.query("clinics").take(500);
  for (const clinic of clinics) {
    if (nameKey(clinic.name, city) === key) return true;
    if (email && clinic.contactEmail?.trim().toLowerCase() === email) return true;
  }
  if (email && (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first())) return true;
  return false;
}

/** Do not contact sticks to the address: a clinic, a company or a person at one marked so. */
async function blockedEmail(ctx: MutationCtx, email: string | undefined) {
  return await emailDoNotContact(ctx, email);
}

const candidateValidator = v.object({
  name: v.string(),
  address: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  website: v.optional(v.string()),
  mapsUrl: v.optional(v.string()),
  placeId: v.optional(v.string()),
  rating: v.optional(v.number()),
  reviews: v.optional(v.number()),
  source: v.union(v.literal("google_places"), v.literal("web_search")),
  sourceUrl: v.optional(v.string()),
});

export const upsertLeads = internalMutation({
  args: {
    city: v.string(),
    country: v.string(),
    candidates: v.array(candidateValidator),
    by: v.id("users"),
    log: v.array(v.object({ source: v.string(), found: v.number(), error: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const addedBySource: Record<string, number> = {};
    for (const c of args.candidates) {
      const key = nameKey(c.name, args.city);
      const domain = domainOf(c.website);
      // The same clinic found again (never an employer company with the same place or website)
      const clinicOf = (rows: Doc<"outreachLeads">[]) => rows.find(isClinicLead) ?? null;
      const existing =
        (c.placeId ? clinicOf(await ctx.db.query("outreachLeads").withIndex("by_place", (q) => q.eq("placeId", c.placeId)).take(5)) : null) ??
        (domain ? clinicOf(await ctx.db.query("outreachLeads").withIndex("by_domain", (q) => q.eq("domain", domain)).take(5)) : null) ??
        clinicOf(await ctx.db.query("outreachLeads").withIndex("by_name_key", (q) => q.eq("nameKey", key)).take(5));
      const email = c.email?.toLowerCase();
      if (existing) {
        // Fill gaps only: what the team edited or decided stays
        const patch: Partial<Doc<"outreachLeads">> = {};
        if (!existing.phone && c.phone) patch.phone = c.phone;
        if (!existing.address && c.address) patch.address = c.address;
        if (!existing.website && c.website) Object.assign(patch, { website: c.website, domain, crawlStatus: "pending" as const });
        if (!existing.placeId && c.placeId) Object.assign(patch, { placeId: c.placeId, mapsUrl: c.mapsUrl, rating: c.rating, reviews: c.reviews });
        if (!existing.email && email) {
          Object.assign(patch, { email, emailSource: c.source });
          if (existing.status === "new" || existing.status === "no_email") patch.status = "ready";
        }
        if (Object.keys(patch).length) {
          await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
          updated++;
        } else skipped++;
        continue;
      }
      const status: LeadStatus = (await onRehabify(ctx, c.name, args.city, email))
        ? "on_rehabify"
        : (await blockedEmail(ctx, email))
          ? "do_not_contact"
          : email
            ? "ready"
            : "new";
      await ctx.db.insert("outreachLeads", {
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
        crawlStatus: c.website && !CLOSED.has(status) ? "pending" : undefined,
        addedBy: args.by,
        createdAt: now,
        updatedAt: now,
      });
      added++;
      addedBySource[c.source] = (addedBySource[c.source] ?? 0) + 1;
    }
    for (const entry of args.log) {
      await ctx.db.insert("outreachSearches", {
        city: args.city,
        source: entry.source,
        found: entry.found,
        added: addedBySource[entry.source] ?? 0,
        error: entry.error,
        by: args.by,
        createdAt: now,
      });
    }
    return { added, updated, skipped };
  },
});

export const pendingCrawl = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    // Clinics and employer companies share the website reader
    const rows = await ctx.db.query("outreachLeads").withIndex("by_crawl", (q) => q.eq("crawlStatus", "pending")).take(args.limit);
    return rows.filter((r) => r.website).map((r) => ({ _id: r._id, website: r.website!, employer: r.kind === "employer" }));
  },
});

export const saveCrawl = internalMutation({
  args: { leadId: v.id("outreachLeads"), emails: v.array(v.string()), phones: v.optional(v.array(v.string())), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead) return null;
    const now = Date.now();
    const employer = lead.kind === "employer";
    const emails = args.emails.map((e) => e.toLowerCase()).slice(0, 10);
    const best = lead.email ?? (employer ? bestEmployerEmail(emails, lead.domain) : bestEmail(emails, lead.domain));
    const patch: Partial<Doc<"outreachLeads">> = {
      crawlStatus: args.error ? "failed" : "done",
      crawlError: args.error?.slice(0, 200),
      crawledAt: now,
      otherEmails: emails.filter((e) => e !== best),
      updatedAt: now,
    };
    if (!lead.email && best) {
      patch.email = best;
      patch.emailSource = "website";
      if (await blockedEmail(ctx, best)) patch.status = "do_not_contact";
      else if (lead.status === "new" || lead.status === "no_email") patch.status = "ready";
    } else if (!lead.email && (lead.status === "new" || lead.status === "no_email")) {
      patch.status = "no_email";
    }
    // Companies: the phones on their pages too (not ones we already have)
    const phones: string[] = [];
    if (employer) {
      const known = new Set([lead.phone, ...(lead.otherPhones ?? [])].filter((p): p is string => Boolean(p)).map(phoneKey));
      for (const phone of args.phones ?? []) if (!known.has(phoneKey(phone))) phones.push(phone);
      if (phones.length) patch.otherPhones = [...(lead.otherPhones ?? []), ...phones].slice(0, 8);
    }
    await ctx.db.patch(lead._id, patch);
    if (employer && (emails.length > 0 || phones.length > 0)) {
      await autoAdvanceStage(ctx, lead._id, "contacts_found", "found on the website");
    }
    return null;
  },
});

/** Reads a few websites per run and schedules the next run until none are waiting. */
export const crawlPending = internalAction({
  args: {},
  handler: async (ctx) => {
    const batch = await ctx.runQuery(pendingRef, { limit: CRAWL_BATCH });
    if (batch.length === 0) return null;
    await Promise.all(
      batch.map(async (lead) => {
        try {
          if (lead.employer) {
            const found = await crawlCompanySite(lead.website);
            await ctx.runMutation(saveCrawlRef, { leadId: lead._id, emails: found.emails, phones: found.phones });
          } else {
            const emails = await crawlSite(lead.website);
            await ctx.runMutation(saveCrawlRef, { leadId: lead._id, emails });
          }
        } catch (err) {
          const message = err instanceof Error ? (err.name === "AbortError" ? "The website took too long to answer" : err.message) : "Couldn't read the website";
          await ctx.runMutation(saveCrawlRef, { leadId: lead._id, emails: [], error: message });
        }
      })
    );
    await ctx.scheduler.runAfter(500, crawlRef, {});
    return null;
  },
});

/** The team's edits: the email, the status or a note. "Do not contact" also covers any other lead with that email. */
export const adminUpdateLead = mutation({
  args: {
    leadId: v.id("outreachLeads"),
    email: v.optional(v.string()),
    status: v.optional(statusValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "outreach:adminUpdateLead");
    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new ConvexError("That clinic isn't on the list any more.");
    const now = Date.now();
    const patch: Partial<Doc<"outreachLeads">> = { updatedAt: now };
    if (args.email !== undefined) {
      const email = args.email.trim().toLowerCase();
      if (email && emailsIn(email)[0] !== email) throw new ConvexError("That doesn't look like an email address.");
      patch.email = email || undefined;
      patch.emailSource = email ? "admin" : undefined;
      // A new address for a clinic whose email bounced makes it ready again
      if (email && (lead.status === "new" || lead.status === "no_email" || (lead.status === "bounced" && email !== lead.email))) patch.status = "ready";
    }
    if (args.status) {
      patch.status = args.status;
      if (args.status === "contacted") patch.contactedAt = now;
    }
    if (args.note !== undefined) patch.note = args.note.trim().slice(0, 500) || undefined;
    await ctx.db.patch(lead._id, patch);
    const email = patch.email ?? lead.email;
    if (args.status === "do_not_contact" && email) {
      for (const other of await ctx.db.query("outreachLeads").withIndex("by_email", (q) => q.eq("email", email)).take(20)) {
        if (other._id !== lead._id) await ctx.db.patch(other._id, { status: "do_not_contact", updatedAt: now });
      }
    }
    return null;
  },
});

/** Reads a clinic's website again (after the team fixed the address, or it was down). */
export const adminRecrawl = mutation({
  args: { leadId: v.id("outreachLeads"), website: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "outreach:adminRecrawl");
    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new ConvexError("That clinic isn't on the list any more.");
    const website = args.website?.trim() || lead.website;
    if (!website) throw new ConvexError("Add the clinic's website first.");
    await ctx.db.patch(lead._id, { website, domain: domainOf(website), crawlStatus: "pending", crawlError: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, crawlRef, {});
    return null;
  },
});

/**
 * The CSV for a cold-email tool: clinics with an email that are ready (or exported before, when
 * asked), never "do not contact", "not interested", "replied" or already on Rehabify.
 * Marks them exported.
 */
export const adminExportLeads = mutation({
  args: { city: v.optional(v.string()), includeExported: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "outreach:adminExportLeads");
    const now = Date.now();
    const want = new Set<LeadStatus>(args.includeExported ? ["ready", "exported"] : ["ready"]);
    const rows: Record<string, string>[] = [];
    for (const status of want) {
      const leads = await ctx.db.query("outreachLeads").withIndex("by_status", (q) => q.eq("status", status)).take(2000);
      for (const lead of leads) {
        if (!isClinicLead(lead) || !lead.email || (args.city && lead.city !== args.city)) continue;
        if (await blockedEmail(ctx, lead.email)) continue;
        rows.push({
          email: lead.email,
          company_name: lead.name,
          city: lead.city,
          phone: lead.phone ?? "",
          website: lead.website ?? "",
          address: lead.address ?? "",
        });
        if (lead.status === "ready") await ctx.db.patch(lead._id, { status: "exported", exportedAt: now, updatedAt: now });
      }
    }
    return { rows };
  },
});

/**
 * Every clinic found, for a spreadsheet (owner, 25 Nov 2026): with an email, without one, or all,
 * in one city or everywhere. Read only: unlike adminExportLeads, nothing is marked exported, and
 * each row says its status (including "do not contact", so the team can see who to leave alone).
 */
export const adminExportAllLeads = query({
  args: {
    city: v.optional(v.string()),
    email: v.union(v.literal("all"), v.literal("with"), v.literal("without")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, "outreach:adminExportAllLeads");
    const leads = await ctx.db.query("outreachLeads").order("desc").take(8000);
    const rows: Record<string, string>[] = [];
    for (const lead of leads) {
      if (!isClinicLead(lead) || (args.city && lead.city !== args.city)) continue;
      if (args.email === "with" && !lead.email) continue;
      if (args.email === "without" && lead.email) continue;
      rows.push({
        clinic: lead.name,
        city: lead.city,
        status: lead.status.replace(/_/g, " "),
        email: lead.email ?? "",
        other_emails: (lead.otherEmails ?? []).join("; "),
        phone: lead.phone ?? "",
        website: lead.website ?? "",
        address: lead.address ?? "",
        google_maps: lead.mapsUrl ?? "",
        rating: lead.rating !== undefined ? String(lead.rating) : "",
        reviews: lead.reviews !== undefined ? String(lead.reviews) : "",
        found_by: lead.source.replace(/_/g, " "),
        found_on: new Date(lead._creationTime).toISOString().slice(0, 10),
        note: lead.note ?? "",
      });
    }
    // City, then name: easy to work through
    rows.sort((a, b) => a.city.localeCompare(b.city) || a.clinic.localeCompare(b.clinic));
    return { rows, capped: leads.length >= 8000 };
  },
});
