/**
 * Rehabify's standard services, prices and payouts (company business model, October 2026).
 *
 * Every Rehabify-affiliated physiotherapist delivers these services at the same price; only
 * home visits vary, by the patient's travel zone. The patient price is all-inclusive:
 * Rehabify absorbs Paystack's fee. The physiotherapist's payout is a separate, fixed amount
 * per service, paid by Rehabify once the session is completed.
 *
 * Code defaults live here; admins override them in Admin › Pricing (convex/serviceTariffs.ts,
 * versioned). Plain TypeScript so both Convex and the Next app import the same quote logic.
 * Amounts are in kobo.
 */

export type RehabifyServiceId =
  | "automated_screening"
  | "recovery_consultation"
  | "virtual_assessment"
  | "home_assessment"
  | "virtual_treatment"
  | "home_treatment"
  | "virtual_review"
  | "home_review";

/** Services a patient can book and pay for. */
export type BookableServiceId = Exclude<RehabifyServiceId, "automated_screening">;

export type ServiceMode = "virtual" | "home";
export type ServiceKind = "screening" | "consultation" | "assessment" | "treatment";

export interface RehabifyService {
  id: RehabifyServiceId;
  name: string;
  shortName: string;
  mode: ServiceMode;
  kind: ServiceKind;
  durationMinutes: number;
  durationLabel: string;
  /** False while the service is "coming soon". */
  bookable: boolean;
  /** Treatment follows an appropriate clinical assessment. */
  requiresPriorAssessment: boolean;
  defaultPriceKobo: number;
  defaultPayoutKobo: number;
  defaultAssistedPriceKobo?: number;
  defaultAssistedPayoutKobo?: number;
  /** Whether the travel-zone charge is added (home services only). */
  defaultTravelApplies: boolean;
  summary: string;
  whatHappens: string[];
  youReceive: string;
  notIncluded?: string;
}

const naira = (amount: number) => amount * 100;

export const REHABIFY_SERVICES: RehabifyService[] = [
  {
    id: "automated_screening",
    name: "Automated Recovery Screening",
    shortName: "Free screening",
    mode: "virtual",
    kind: "screening",
    durationMinutes: 10,
    durationLabel: "5–10 minutes",
    bookable: false,
    requiresPriorAssessment: false,
    defaultPriceKobo: 0,
    defaultPayoutKobo: 0,
    defaultTravelApplies: false,
    summary: "A short guided check of your symptoms to point you to the right care.",
    whatHappens: ["Answer a few questions about your pain, injury or movement", "Get a suggested next step"],
    youReceive: "A suggested next step. Coming soon.",
  },
  {
    id: "recovery_consultation",
    name: "Initial Recovery Consultation",
    shortName: "Recovery consultation",
    mode: "virtual",
    kind: "consultation",
    durationMinutes: 20,
    durationLabel: "15–20 minutes",
    bookable: true,
    requiresPriorAssessment: false,
    defaultPriceKobo: naira(6_000),
    defaultPayoutKobo: naira(4_200),
    defaultTravelApplies: false,
    summary: "Not sure where to start? Speak with a physiotherapist about your symptoms and the right next step.",
    whatHappens: [
      "You explain your main complaint: pain, injury or difficulty with movement",
      "The clinician takes a brief relevant history",
      "Any concern needing urgent attention or medical referral is identified",
      "Your main day-to-day difficulties are discussed",
      "The clinician explains the most appropriate next step",
    ],
    youReceive: "A brief professional consultation, a recommended next step and clear information about the relevant assessment fee.",
    notIncluded: "A comprehensive physical assessment, a detailed treatment programme or ongoing rehabilitation.",
  },
  {
    id: "virtual_assessment",
    name: "Comprehensive Virtual Physiotherapy Assessment",
    shortName: "Virtual assessment",
    mode: "virtual",
    kind: "assessment",
    durationMinutes: 60,
    durationLabel: "60 minutes",
    bookable: true,
    requiresPriorAssessment: false,
    defaultPriceKobo: naira(20_000),
    defaultPayoutKobo: naira(12_000),
    defaultAssistedPriceKobo: naira(10_000),
    defaultAssistedPayoutKobo: naira(8_000),
    defaultTravelApplies: false,
    summary: "A detailed clinical assessment by video, with your initial recovery plan included.",
    whatHappens: [
      "Comprehensive clinical history and symptom review",
      "Medical history, previous treatment and precautions",
      "Assessment of pain, mobility and functional limitations",
      "Guided movement and functional assessment where appropriate",
      "Your goals, the findings and your treatment options",
      "An initial personalised recovery programme where indicated",
    ],
    youReceive: "A documented clinical assessment, an initial care plan, exercise instructions and a recommendation for next steps.",
    notIncluded: "Where a physical examination is needed, your clinician will recommend an in-person assessment.",
  },
  {
    id: "home_assessment",
    name: "Initial Home Physiotherapy Assessment",
    shortName: "Home assessment",
    mode: "home",
    kind: "assessment",
    durationMinutes: 90,
    durationLabel: "90 minutes",
    bookable: true,
    requiresPriorAssessment: false,
    defaultPriceKobo: naira(30_000),
    defaultPayoutKobo: naira(18_000),
    defaultAssistedPriceKobo: naira(16_000),
    defaultAssistedPayoutKobo: naira(13_000),
    defaultTravelApplies: true,
    summary: "Our comprehensive in-person first assessment, at your home.",
    whatHappens: [
      "Detailed history and clinical examination",
      "Physical and functional assessment",
      "Movement limitations and everyday activities",
      "Your home environment, where clinically useful",
      "Initial treatment or supervised exercise where appropriate",
      "A personalised rehabilitation plan and next steps",
    ],
    youReceive: "A documented clinical assessment, an initial recovery programme and a recommended treatment pathway.",
    notIncluded: "The 90 minutes is time with your clinician and excludes their travel.",
  },
  {
    id: "virtual_treatment",
    name: "Virtual Physiotherapy Treatment",
    shortName: "Virtual follow-up",
    mode: "virtual",
    kind: "treatment",
    durationMinutes: 30,
    durationLabel: "30 minutes",
    bookable: true,
    requiresPriorAssessment: true,
    defaultPriceKobo: naira(12_000),
    defaultPayoutKobo: naira(7_200),
    defaultTravelApplies: false,
    summary: "For patients already assessed whose treatment can be delivered remotely.",
    whatHappens: [
      "Review of symptoms and progress",
      "Guided therapeutic exercises or other remote treatment",
      "Help with any difficulties in your home programme",
      "Education and programme adjustments",
      "Confirmation of your next step",
    ],
    youReceive: "Updated clinical notes and recovery instructions where appropriate.",
  },
  {
    id: "home_treatment",
    name: "Home Physiotherapy Treatment",
    shortName: "Home treatment",
    mode: "home",
    kind: "treatment",
    durationMinutes: 60,
    durationLabel: "60 minutes",
    bookable: true,
    requiresPriorAssessment: true,
    defaultPriceKobo: naira(30_000),
    defaultPayoutKobo: naira(18_000),
    defaultTravelApplies: true,
    summary: "A treatment session at your home, following your assessment.",
    whatHappens: [
      "Brief review of symptoms and progress",
      "Your prescribed physiotherapy treatment",
      "Supervised therapeutic exercises",
      "Monitoring of your functional progress",
      "Review and progression of your home programme",
    ],
    youReceive: "Treatment, documentation of your response and an updated home programme.",
  },
  {
    id: "virtual_review",
    name: "Virtual Physiotherapy Review",
    shortName: "Virtual review",
    mode: "virtual",
    kind: "treatment",
    durationMinutes: 45,
    durationLabel: "45 minutes",
    bookable: true,
    requiresPriorAssessment: true,
    defaultPriceKobo: naira(15_000),
    defaultPayoutKobo: naira(9_000),
    defaultTravelApplies: false,
    summary: "A progress review by video for patients already in treatment.",
    whatHappens: [
      "Review of your symptoms, function and goals",
      "Re-assessment of the areas being treated",
      "Progress measured against your plan",
      "Your programme updated or progressed",
      "Agreement on the next stage of your care",
    ],
    youReceive: "An updated assessment of your progress and a revised recovery plan.",
  },
  {
    id: "home_review",
    name: "Home Physiotherapy Review",
    shortName: "Home review",
    mode: "home",
    kind: "treatment",
    durationMinutes: 60,
    durationLabel: "60 minutes",
    bookable: true,
    requiresPriorAssessment: true,
    defaultPriceKobo: naira(30_000),
    defaultPayoutKobo: naira(18_000),
    defaultTravelApplies: true,
    summary: "An in-person progress review at your home for patients already in treatment.",
    whatHappens: [
      "Review of your symptoms, function and goals",
      "Physical re-examination of the areas being treated",
      "Progress measured against your plan",
      "Your programme updated or progressed",
      "Agreement on the next stage of your care",
    ],
    youReceive: "An updated clinical assessment of your progress and a revised recovery plan.",
  },
];

export const BOOKABLE_SERVICE_IDS = REHABIFY_SERVICES.filter((s) => s.bookable).map((s) => s.id) as BookableServiceId[];

const BY_ID = new Map(REHABIFY_SERVICES.map((service) => [service.id, service]));

export function getService(id: string): RehabifyService | undefined {
  return BY_ID.get(id as RehabifyServiceId);
}

export function isBookableServiceId(id: unknown): id is BookableServiceId {
  return typeof id === "string" && (BOOKABLE_SERVICE_IDS as string[]).includes(id);
}

// ── Tariffs (admin-editable prices and payouts) ────────────────────────────

export interface ServiceTariff {
  priceKobo: number;
  payoutKobo: number;
  /** Rehabify Access (assisted care) price; unset means the service isn't offered under Access. */
  assistedPriceKobo?: number;
  assistedPayoutKobo?: number;
  travelApplies: boolean;
  active: boolean;
}

export type TariffTable = Record<BookableServiceId, ServiceTariff>;

export function defaultTariffs(): TariffTable {
  const table = {} as TariffTable;
  for (const id of BOOKABLE_SERVICE_IDS) {
    const service = BY_ID.get(id)!;
    table[id] = {
      priceKobo: service.defaultPriceKobo,
      payoutKobo: service.defaultPayoutKobo,
      assistedPriceKobo: service.defaultAssistedPriceKobo,
      assistedPayoutKobo: service.defaultAssistedPayoutKobo,
      travelApplies: service.mode === "home" && service.defaultTravelApplies,
      active: true,
    };
  }
  return table;
}

/** Saved tariff rows layered over the defaults (unknown services ignored, home-only travel). */
export function mergeTariffs(saved: Partial<Record<string, Partial<ServiceTariff>>> | null | undefined): TariffTable {
  const table = defaultTariffs();
  if (!saved) return table;
  for (const id of BOOKABLE_SERVICE_IDS) {
    const row = saved[id];
    if (!row) continue;
    const isHome = BY_ID.get(id)!.mode === "home";
    table[id] = {
      priceKobo: validKobo(row.priceKobo) ?? table[id].priceKobo,
      payoutKobo: validKobo(row.payoutKobo) ?? table[id].payoutKobo,
      assistedPriceKobo: "assistedPriceKobo" in row ? validKobo(row.assistedPriceKobo) : table[id].assistedPriceKobo,
      assistedPayoutKobo: "assistedPayoutKobo" in row ? validKobo(row.assistedPayoutKobo) : table[id].assistedPayoutKobo,
      travelApplies: isHome && (row.travelApplies ?? table[id].travelApplies),
      active: row.active ?? true,
    };
  }
  return table;
}

function validKobo(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

// ── Fees and quotes ────────────────────────────────────────────────────────

/**
 * Paystack's inbound fee on a local payment: 1.5% + ₦100 (₦100 waived under ₦2,500),
 * capped at ₦2,000. Rehabify absorbs it, so it only reduces Rehabify's share.
 */
export function paystackFeeEstimateKobo(amountKobo: number): number {
  if (amountKobo <= 0) return 0;
  const flat = amountKobo >= 250_000 ? 10_000 : 0;
  return Math.min(Math.round(amountKobo * 0.015) + flat, 200_000);
}

/** The travel zone fields a quote needs. */
export interface QuoteZone {
  name: string;
  surchargeKobo: number;
  /** Share of the surcharge paid to the physiotherapist (default 100). */
  physioTravelSharePercent?: number;
}

export interface RehabifyQuote {
  serviceId: BookableServiceId;
  assisted: boolean;
  basePriceKobo: number;
  travelSurchargeKobo: number;
  /** What the patient pays: all-inclusive. */
  chargeKobo: number;
  payoutKobo: number;
  travelPhysioShareKobo: number;
  /** payout + travel share: what the physiotherapist earns. */
  physioEarningsKobo: number;
  feeEstimateKobo: number;
  /** charge − physio earnings − Paystack fee (before any partner commission). May be negative under Access. */
  rehabifyKobo: number;
}

export class QuoteError extends Error {}

/**
 * The price of one session. Throws QuoteError when the service can't be booked as asked
 * (inactive, a home visit without a zone, or no assisted tariff for Access).
 */
export function quoteService(input: {
  serviceId: string;
  tariffs: TariffTable;
  zone?: QuoteZone | null;
  assisted?: boolean;
}): RehabifyQuote {
  if (!isBookableServiceId(input.serviceId)) throw new QuoteError("This service can't be booked.");
  const service = BY_ID.get(input.serviceId)!;
  const tariff = input.tariffs[input.serviceId];
  if (!tariff?.active) throw new QuoteError(`${service.name} isn't available right now.`);

  const assisted = Boolean(input.assisted);
  let basePriceKobo = tariff.priceKobo;
  let payoutKobo = tariff.payoutKobo;
  if (assisted) {
    if (tariff.assistedPriceKobo === undefined || tariff.assistedPayoutKobo === undefined) {
      throw new QuoteError(`${service.name} isn't offered under Rehabify Access yet.`);
    }
    basePriceKobo = tariff.assistedPriceKobo;
    payoutKobo = tariff.assistedPayoutKobo;
  }

  let travelSurchargeKobo = 0;
  let travelPhysioShareKobo = 0;
  if (service.mode === "home") {
    if (!input.zone) throw new QuoteError("Choose your area so we can confirm we cover it.");
    if (tariff.travelApplies) {
      travelSurchargeKobo = Math.max(0, Math.round(input.zone.surchargeKobo));
      const share = clampPercent(input.zone.physioTravelSharePercent ?? 100);
      travelPhysioShareKobo = Math.round((travelSurchargeKobo * share) / 100);
    }
  }

  const chargeKobo = basePriceKobo + travelSurchargeKobo;
  const physioEarningsKobo = payoutKobo + travelPhysioShareKobo;
  const feeEstimateKobo = paystackFeeEstimateKobo(chargeKobo);
  return {
    serviceId: input.serviceId,
    assisted,
    basePriceKobo,
    travelSurchargeKobo,
    chargeKobo,
    payoutKobo,
    travelPhysioShareKobo,
    physioEarningsKobo,
    feeEstimateKobo,
    rehabifyKobo: chargeKobo - physioEarningsKobo - feeEstimateKobo,
  };
}

function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
}

// ── Display helpers ────────────────────────────────────────────────────────

export function formatKobo(kobo: number): string {
  return `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`;
}

/** "₦30,000" or "From ₦30,000" when a travel charge may be added. */
export function priceLabel(serviceId: BookableServiceId, tariffs: TariffTable): string {
  const tariff = tariffs[serviceId];
  return tariff.travelApplies ? `From ${formatKobo(tariff.priceKobo)}` : formatKobo(tariff.priceKobo);
}

/**
 * The service a legacy booking link duration maps to (/book/[id]/30|45|60). Old links keep
 * working; the patient confirms the service on the next step.
 */
export function serviceForLegacyDuration(minutes: number): BookableServiceId {
  if (minutes <= 20) return "recovery_consultation";
  if (minutes <= 30) return "virtual_treatment";
  return "virtual_assessment";
}
