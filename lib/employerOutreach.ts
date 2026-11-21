/**
 * Employer outreach ("Rehabify for Work" sales, owner 20 Nov 2026): the sectors the team searches,
 * the pipeline stages and the role groups of the people we look for. Shared by the admin page
 * (app/dashboard/admin/employer-outreach) and Convex (convex/employerOutreach.ts), so a new sector
 * or search phrase is added here once. No server or browser code in this file.
 */

export type EmployerSector = {
  key: string;
  label: string;
  /** Google Maps search phrases; " in {city}, {country}" is added to each */
  queries: string[];
};

/** Sector key → label → Google Places search phrases. "other" uses the admin's own words. */
export const EMPLOYER_SECTORS: readonly EmployerSector[] = [
  { key: "logistics", label: "Logistics and delivery", queries: ["logistics company", "haulage company", "courier company"] },
  { key: "transport", label: "Transport", queries: ["transport company", "bus company"] },
  { key: "manufacturing", label: "Manufacturing", queries: ["manufacturing company", "factory"] },
  { key: "banking", label: "Banking", queries: ["bank head office", "microfinance bank"] },
  { key: "insurance", label: "Insurance", queries: ["insurance company"] },
  { key: "oil_gas", label: "Oil and gas", queries: ["oil and gas company"] },
  { key: "telecoms", label: "Telecoms", queries: ["telecommunications company"] },
  { key: "fmcg", label: "FMCG", queries: ["FMCG company", "consumer goods company"] },
  { key: "construction", label: "Construction", queries: ["construction company"] },
  { key: "aviation", label: "Aviation", queries: ["aviation company", "airline office"] },
  { key: "tech", label: "Tech, BPO and call centres", queries: ["tech company", "BPO company", "call centre"] },
  { key: "retail", label: "Retail", queries: ["supermarket chain"] },
  { key: "hospitality", label: "Hotels and hospitality", queries: ["hotel"] },
  { key: "education", label: "Schools and universities", queries: ["private school", "university"] },
  { key: "public", label: "Government agencies", queries: ["government agency"] },
  { key: "other", label: "Other (type your own)", queries: [] },
];

export const SECTOR_LABEL: Record<string, string> = Object.fromEntries(EMPLOYER_SECTORS.map((s) => [s.key, s.label]));

export function sectorByKey(key: string): EmployerSector | undefined {
  return EMPLOYER_SECTORS.find((s) => s.key === key);
}

/** The most sectors one "Find companies" run searches (each one costs searches) */
export const MAX_SECTORS_PER_RUN = 5;
/** The most companies one "Find people" run looks at (one AI web search each) */
export const MAX_PEOPLE_RUN = 10;
/** A company's people aren't searched again within this time unless the team asks */
export const PEOPLE_SEARCH_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Pipeline ────────────────────────────────────────────────────────────────

export const EMPLOYER_STAGES = [
  "found",
  "contacts_found",
  "contacted",
  "replied",
  "meeting_booked",
  "pilot_proposed",
  "pilot_live",
  "paying",
  "lost",
  "do_not_contact",
] as const;
export type EmployerStage = (typeof EMPLOYER_STAGES)[number];

export const STAGE_LABEL: Record<EmployerStage, string> = {
  found: "Found",
  contacts_found: "Contacts found",
  contacted: "Contacted",
  replied: "Replied",
  meeting_booked: "Meeting booked",
  pilot_proposed: "Pilot proposed",
  pilot_live: "Pilot live",
  paying: "Paying",
  lost: "Lost",
  do_not_contact: "Do not contact",
};

/** The forward order; "lost" and "do not contact" sit outside it */
const FORWARD: readonly EmployerStage[] = EMPLOYER_STAGES.slice(0, 8);

/**
 * Whether an automatic move (contacts found, first email sent, reply) may change `current` to
 * `next`: only forward, and never over a stage the team set later in the pipeline, "lost" or
 * "do not contact".
 */
export function canAutoAdvance(current: EmployerStage | undefined, next: EmployerStage): boolean {
  if (current === "lost" || current === "do_not_contact") return false;
  const from = FORWARD.indexOf(current ?? "found");
  const to = FORWARD.indexOf(next);
  return to > from;
}

/** Stages where the sequence emails stop: the company answered or the team took over. */
export function stageStopsEmails(stage: EmployerStage | undefined): boolean {
  if (!stage) return false;
  if (stage === "lost" || stage === "do_not_contact") return true;
  return FORWARD.indexOf(stage) >= FORWARD.indexOf("replied");
}

// ─── People ──────────────────────────────────────────────────────────────────

export const ROLE_GROUPS = ["hr", "operations", "hse", "leadership", "other"] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

export const ROLE_GROUP_LABEL: Record<RoleGroup, string> = {
  hr: "HR",
  operations: "Operations",
  hse: "Health & safety",
  leadership: "Leadership",
  other: "Other",
};

/** Sorts a job title as written ("Head, People & Culture") into the group we care about. */
export function roleGroupOf(role: string | undefined): RoleGroup {
  const r = ` ${(role ?? "").toLowerCase().replace(/[^a-z&]+/g, " ")} `;
  if (/\b(hse|qhse|ehs|health and safety|health & safety|safety|occupational health|welfare)\b/.test(r)) return "hse";
  if (/\b(hr|human resources?|human capital|people|talent|personnel|recruit\w*|culture)\b/.test(r)) return "hr";
  if (/\b(operations?|operating|ops|coo|plant|facility|facilities|fleet|logistics|warehouse|production|supply chain)\b/.test(r)) return "operations";
  if (/\b(ceo|md|managing director|chief|director|founder|co founder|president|general manager|gm|country manager|executive)\b/.test(r)) return "leadership";
  return "other";
}

/** "Mrs. Adaeze Okafor" → "Adaeze"; titles and initials are skipped. */
export function firstNameOf(name: string | undefined): string | undefined {
  const words = (name ?? "")
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/\.$/, ""))
    .filter(Boolean);
  const TITLES = /^(mr|mrs|ms|miss|dr|engr|eng|prof|chief|alhaji|alhaja|pastor|barr|arc|sir|dame|hon|otunba|mallam|madam)$/i;
  const first = words.find((w) => !TITLES.test(w) && /[a-z]{2,}/i.test(w));
  if (!first) return undefined;
  // "ADAEZE" from a shouty directory reads as "Adaeze"
  const rest = first === first.toUpperCase() ? first.slice(1).toLowerCase() : first.slice(1);
  return first.charAt(0).toUpperCase() + rest;
}
