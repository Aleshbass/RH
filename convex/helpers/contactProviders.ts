/**
 * Contact-data providers for Employer outreach (employerContacts.ts, owner 22 Nov 2026): Hunter
 * (HUNTER_API_KEY), Apollo (APOLLO_API_KEY) and Prospeo (PROSPEO_API_KEY), on their free plans.
 *
 * Free allowances are tiny (Hunter: about 50 searches and 100 checks a month), so each call here is
 * one deliberate request; the run that uses them decides how many. Keys go in request headers,
 * never in URLs, and never into logs or the messages the team sees. Every call has a time limit,
 * and failures become a ProviderError with a plain message.
 */
import type { VerifyStatus } from "../../lib/employerOutreach";

export type Provider = "hunter" | "apollo" | "prospeo";
export type ProviderFailure = "no_key" | "refused" | "used_up" | "error";

const TIMEOUT_MS = 20_000;
const NAME: Record<Provider, string> = { hunter: "Hunter", apollo: "Apollo", prospeo: "Prospeo" };

export class ProviderError extends Error {
  constructor(
    public provider: Provider,
    public kind: ProviderFailure,
    message: string
  ) {
    super(message);
  }
}

export const providerKey = (provider: Provider) =>
  (provider === "hunter" ? process.env.HUNTER_API_KEY : provider === "apollo" ? process.env.APOLLO_API_KEY : process.env.PROSPEO_API_KEY)?.trim() ||
  undefined;

function keyFor(provider: Provider): string {
  const key = providerKey(provider);
  if (!key) throw new ProviderError(provider, "no_key", `Add ${provider.toUpperCase()}_API_KEY on Convex to use ${NAME[provider]}.`);
  return key;
}

async function call(provider: Provider, url: string, init: RequestInit): Promise<{ status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const data: any = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    throw new ProviderError(provider, "error", timedOut ? `${NAME[provider]} took too long to answer.` : `Couldn't reach ${NAME[provider]}.`);
  } finally {
    clearTimeout(timer);
  }
}

const str = (value: unknown, max = 200) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

const VERIFY_SET = new Set<string>(["valid", "accept_all", "unknown", "webmail", "disposable", "invalid"]);
const asVerify = (value: unknown): VerifyStatus | undefined =>
  typeof value === "string" && VERIFY_SET.has(value.toLowerCase()) ? (value.toLowerCase() as VerifyStatus) : undefined;

/** "linkedin.com/in/ada" or a bare handle as a full link. */
function linkedinUrl(value: unknown): string | undefined {
  const raw = str(value, 300);
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return /linkedin\.com\//i.test(raw) ? raw : undefined;
  if (/linkedin\.com\//i.test(raw)) return `https://${raw.replace(/^\/+/, "")}`;
  return /^[\w-]{3,100}$/.test(raw) ? `https://www.linkedin.com/in/${raw}` : undefined;
}

// ─── Hunter ──────────────────────────────────────────────────────────────────

const HUNTER = "https://api.hunter.io/v2";

function hunterFailure(status: number): ProviderError {
  if (status === 401) return new ProviderError("hunter", "refused", "Hunter refused the API key (HUNTER_API_KEY).");
  if (status === 429) return new ProviderError("hunter", "used_up", "Hunter's allowance for this month is used up.");
  if (status === 403) return new ProviderError("hunter", "error", "Hunter says too many requests at once. Try again in a minute.");
  if (status === 400 || status === 422) return new ProviderError("hunter", "error", "Hunter couldn't search that company's website.");
  if (status === 451) return new ProviderError("hunter", "error", "That person asked Hunter not to share their details.");
  return new ProviderError("hunter", "error", `Hunter had a problem (HTTP ${status}). Try again later.`);
}

async function hunterGet(path: string, params: Record<string, string>) {
  const key = keyFor("hunter");
  const qs = new URLSearchParams(params).toString();
  return await call("hunter", `${HUNTER}/${path}${qs ? `?${qs}` : ""}`, { headers: { "X-API-KEY": key, Accept: "application/json" } });
}

export type HunterPerson = {
  firstName: string;
  lastName?: string;
  position?: string;
  department?: string;
  email: string;
  confidence?: number;
  linkedinUrl?: string;
  phone?: string;
  verification?: VerifyStatus;
};

/**
 * Domain Search (1 search): named people in HR, management, executive and operations, with the
 * company's email pattern. The free plan returns at most 10.
 */
export async function hunterDomainSearch(domain: string): Promise<{ pattern?: string; people: HunterPerson[] }> {
  const { status, data } = await hunterGet("domain-search", {
    domain,
    type: "personal",
    department: "hr,management,executive,operations",
    limit: "10",
  });
  if (status !== 200) throw hunterFailure(status);
  const people: HunterPerson[] = [];
  for (const row of Array.isArray(data?.data?.emails) ? data.data.emails : []) {
    const email = str(row?.value, 120)?.toLowerCase();
    const firstName = str(row?.first_name, 60);
    if (!email || !firstName) continue; // only named people
    people.push({
      firstName,
      lastName: str(row?.last_name, 60),
      position: str(row?.position, 120),
      department: str(row?.department, 40),
      email,
      confidence: num(row?.confidence),
      linkedinUrl: linkedinUrl(row?.linkedin),
      phone: str(row?.phone_number, 40),
      verification: asVerify(row?.verification?.status),
    });
  }
  return { pattern: str(data?.data?.pattern, 60), people };
}

/** Email Finder (1 search, nothing charged when it finds nothing). */
export async function hunterEmailFinder(domain: string, firstName: string, lastName: string) {
  const { status, data } = await hunterGet("email-finder", { domain, first_name: firstName, last_name: lastName });
  if (status === 404) return null;
  if (status !== 200) throw hunterFailure(status);
  const email = str(data?.data?.email, 120)?.toLowerCase();
  if (!email) return null;
  return {
    email,
    confidence: num(data?.data?.score),
    verification: asVerify(data?.data?.verification?.status),
    linkedinUrl: linkedinUrl(data?.data?.linkedin_url),
    phone: str(data?.data?.phone_number, 40),
    position: str(data?.data?.position, 120),
  };
}

/**
 * Email Verifier (1 check). Hunter answers 202 while it is still checking; asking again counts as
 * the same request, so it is asked once more after a short wait. null: not settled yet.
 * "claimed": the person asked Hunter not to process their address.
 */
export async function hunterVerify(email: string): Promise<VerifyStatus | "claimed" | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { status, data } = await hunterGet("email-verifier", { email });
    if (status === 200) return asVerify(data?.data?.status) ?? "unknown";
    if (status === 451) return "claimed";
    if (status !== 202 && status !== 222) throw hunterFailure(status);
    if (attempt === 0) await new Promise((r) => setTimeout(r, 4_000));
  }
  return null;
}

type Pool = { used?: number; available?: number };
/** Account (free): searches and checks used this month, and when they reset. */
export async function hunterAccount(): Promise<{ plan?: string; resetDate?: string; searches?: Pool; verifications?: Pool; credits?: Pool }> {
  const { status, data } = await hunterGet("account", {});
  if (status !== 200) throw hunterFailure(status);
  const pool = (p: any): Pool | undefined =>
    p && typeof p === "object" ? { used: num(p.used), available: num(p.available) } : undefined;
  const requests = data?.data?.requests;
  return {
    plan: str(data?.data?.plan_name, 60),
    resetDate: str(data?.data?.reset_date, 20),
    searches: pool(requests?.searches),
    verifications: pool(requests?.verifications),
    credits: pool(requests?.credits),
  };
}

// ─── Apollo ──────────────────────────────────────────────────────────────────

const APOLLO = "https://api.apollo.io/api/v1";

function apolloFailure(status: number, what: string): ProviderError {
  if (status === 401) return new ProviderError("apollo", "refused", "Apollo refused the API key (APOLLO_API_KEY).");
  if (status === 403 || status === 422) return new ProviderError("apollo", "refused", `Apollo's plan doesn't allow ${what}.`);
  if (status === 402) return new ProviderError("apollo", "used_up", "Apollo's credits are used up.");
  if (status === 429) return new ProviderError("apollo", "used_up", "Apollo's limit is reached for now. Try again later.");
  return new ProviderError("apollo", "error", `Apollo had a problem (HTTP ${status}). Try again later.`);
}

async function apolloCall(path: string, params: [string, string][], method: "GET" | "POST") {
  const key = keyFor("apollo");
  const qs = new URLSearchParams(params).toString();
  return await call("apollo", `${APOLLO}/${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: { "X-Api-Key": key, "Content-Type": "application/json", Accept: "application/json", "Cache-Control": "no-cache" },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
}

export type ApolloPerson = { id: string; firstName: string; lastName?: string; lastNameComplete: boolean; title?: string; linkedinUrl?: string };

/**
 * People API Search (no credits): people at the company with these job titles. Apollo shows only
 * part of each last name here ("Ok***r") and no emails; People Match fills those in later.
 */
export async function apolloPeopleSearch(domain: string, titles: string[]): Promise<ApolloPerson[]> {
  const params: [string, string][] = [
    ["q_organization_domains_list[]", domain],
    ...titles.map((t): [string, string] => ["person_titles[]", t]),
    ["include_similar_titles", "true"],
    ["page", "1"],
    ["per_page", "10"],
  ];
  const { status, data } = await apolloCall("mixed_people/api_search", params, "POST");
  if (status !== 200) throw apolloFailure(status, "people search");
  const out: ApolloPerson[] = [];
  for (const row of Array.isArray(data?.people) ? data.people : []) {
    const id = str(row?.id, 60);
    const firstName = str(row?.first_name, 60);
    if (!id || !firstName) continue;
    const full = str(row?.last_name, 60);
    out.push({
      id,
      firstName,
      lastName: full ?? str(row?.last_name_obfuscated, 60),
      lastNameComplete: Boolean(full),
      title: str(row?.title, 120),
      linkedinUrl: linkedinUrl(row?.linkedin_url),
    });
  }
  return out;
}

/**
 * People Match (about 1 credit when it finds someone): the full name, LinkedIn and work email.
 * Personal emails and phone numbers are never asked for.
 */
export async function apolloMatch(input: { id?: string; firstName?: string; lastName?: string; domain: string; linkedinUrl?: string }) {
  const params: [string, string][] = [
    ["reveal_personal_emails", "false"],
    ["reveal_phone_number", "false"],
    ["domain", input.domain],
  ];
  if (input.id) params.push(["id", input.id]);
  if (input.firstName) params.push(["first_name", input.firstName]);
  if (input.lastName) params.push(["last_name", input.lastName]);
  if (input.linkedinUrl) params.push(["linkedin_url", input.linkedinUrl]);
  const { status, data } = await apolloCall("people/match", params, "POST");
  if (status === 404) return null;
  if (status !== 200) throw apolloFailure(status, "looking people up");
  const p = data?.person;
  if (!p) return null;
  const email = str(p.email, 120)?.toLowerCase();
  return {
    firstName: str(p.first_name, 60),
    lastName: str(p.last_name, 60),
    title: str(p.title, 120),
    linkedinUrl: linkedinUrl(p.linkedin_url),
    // Apollo puts a placeholder here when the email isn't unlocked on the plan
    email: email && !/^email_not_unlocked@/i.test(email) && !email.includes("*") ? email : undefined,
    verified: str(p.email_status, 30)?.toLowerCase() === "verified",
  };
}

/** Is the key working (free)? */
export async function apolloHealth(): Promise<{ ok: boolean; message?: string }> {
  const { status, data } = await apolloCall("auth/health", [], "GET");
  if (status === 200 && (data?.is_logged_in === true || data?.healthy === true)) return { ok: true };
  if (status === 401 || data?.is_logged_in === false) return { ok: false, message: "Apollo refused the API key (APOLLO_API_KEY)." };
  return { ok: false, message: `Apollo had a problem (HTTP ${status}).` };
}

// ─── Prospeo ─────────────────────────────────────────────────────────────────

const PROSPEO = "https://api.prospeo.io";

function prospeoFailure(status: number, code: string | undefined): ProviderError {
  if (code === "INVALID_API_KEY" || status === 401) return new ProviderError("prospeo", "refused", "Prospeo refused the API key (PROSPEO_API_KEY).");
  if (code === "INSUFFICIENT_CREDITS") return new ProviderError("prospeo", "used_up", "Prospeo's credits are used up.");
  if (status === 429) return new ProviderError("prospeo", "error", "Prospeo says too many requests at once. Try again in a minute.");
  if (code === "INVALID_DATAPOINTS" || code === "INVALID_REQUEST") return new ProviderError("prospeo", "error", "Prospeo couldn't look that person up.");
  return new ProviderError("prospeo", "error", `Prospeo had a problem (HTTP ${status}). Try again later.`);
}

async function prospeoPost(path: string, body: unknown) {
  const key = keyFor("prospeo");
  return await call("prospeo", `${PROSPEO}/${path}`, {
    method: "POST",
    headers: { "X-KEY": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

/**
 * Enrich Person (1 credit only when it finds an email; nothing when there's no match): a work
 * email Prospeo has verified, from the name and the company's website.
 */
export async function prospeoFindEmail(input: { firstName: string; lastName: string; domain: string; linkedinUrl?: string }) {
  const { status, data } = await prospeoPost("enrich-person", {
    only_verified_email: true,
    enrich_mobile: false,
    data: {
      first_name: input.firstName,
      last_name: input.lastName,
      company_website: input.domain,
      ...(input.linkedinUrl ? { linkedin_url: input.linkedinUrl } : {}),
    },
  });
  const code = str(data?.error_code, 40);
  if (code === "NO_MATCH") return null;
  if (status !== 200 || data?.error === true) throw prospeoFailure(status, code);
  const found = data?.person?.email;
  const email = str(found?.email, 120)?.toLowerCase();
  if (!email || email.includes("*") || found?.revealed === false) return null;
  return { email, verified: str(found?.status, 30)?.toUpperCase() === "VERIFIED", linkedinUrl: linkedinUrl(data?.person?.linkedin_url) };
}

/** Account information (free): credits left and when they renew. */
export async function prospeoAccount(): Promise<{ plan?: string; remaining?: number; used?: number; resetDate?: string }> {
  const { status, data } = await prospeoPost("account-information", {});
  const code = str(data?.error_code, 40);
  if (status !== 200 || data?.error === true) throw prospeoFailure(status, code);
  const r = data?.response ?? {};
  return {
    plan: str(r.current_plan, 60),
    remaining: num(r.remaining_credits),
    used: num(r.used_credits),
    resetDate: str(r.next_quota_renewal_date, 30)?.slice(0, 10),
  };
}

// ─── Email patterns ──────────────────────────────────────────────────────────

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/**
 * Hunter's pattern ("{first}.{last}", "{f}{last}") filled in for one person. A guess: shown to the
 * team as a suggestion and never emailed until it passes the check.
 */
export function emailFromPattern(pattern: string, firstName: string, lastName: string, domain: string): string | undefined {
  const first = plain(firstName);
  const last = plain(lastName);
  if (!first || !last || !/\{(first|last|f|l)\}/.test(pattern)) return undefined;
  const local = pattern
    .replace(/\{first\}/g, first)
    .replace(/\{last\}/g, last)
    .replace(/\{f\}/g, first[0])
    .replace(/\{l\}/g, last[0]);
  if (!/^[a-z0-9._-]+$/.test(local)) return undefined;
  return `${local}@${domain}`;
}
