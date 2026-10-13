/**
 * Server-side price check for marketplace bookings.
 *
 * The booking page computes the amount in the browser, so the mutation must never take it
 * on trust. An amount is accepted only if the booking page could have shown it for this
 * physiotherapist and package:
 *   - per-session rate: the physio's hourlyRate, or any rate on the published tariff
 *     (lib/pricing calculateSessionPrice: location tier x condition level x physio level)
 *   - package of 1, 4, 8 or 12 sessions with the physio's package discount (default 7%)
 *   - or the physio's initial consultation / hourly rate on their own
 *   - plus Paystack's inbound fee when the platform makes the patient bear it
 * Physiotherapists without any rate are booked at the default virtual (₦6,000) or in-person
 * (₦10,000) rate, never for free.
 *
 * Mirrors app/book/[physiotherapistId]/[duration]/page.tsx; scripts/marketplace-pricing.test.ts
 * checks that every price the page can produce is accepted and tampered amounts are rejected.
 */
import { ConvexError } from "convex/values";
import {
  CITIES,
  calculatePaystackInboundGrossAmount,
  calculateSessionPrice,
  type ConditionLevel,
  type PhysioLevel,
} from "../../lib/pricing";

const PACKAGE_SIZES = [1, 4, 8, 12] as const;
const CONDITION_LEVELS: ConditionLevel[] = ["standard", "moderate", "complex"];
const PHYSIO_LEVELS: PhysioLevel[] = ["standard", "senior", "consultant"];
const DEFAULT_VIRTUAL_KOBO = 600_000;
const DEFAULT_IN_PERSON_KOBO = 1_000_000;

type PricedProfile = {
  hourlyRate?: number; // kobo
  initialConsultRate?: number; // kobo
  packageDiscountPercent?: number;
  virtualConsultationRate?: number; // kobo
  inPersonConsultationRate?: number; // kobo
};

let tariffRatesNaira: number[] | null = null;
function tariffRates(): number[] {
  if (!tariffRatesNaira) {
    const rates = new Set<number>();
    for (const city of Object.values(CITIES)) {
      for (const area of city.areas) {
        for (const condition of CONDITION_LEVELS) {
          for (const physioLevel of PHYSIO_LEVELS) rates.add(calculateSessionPrice(area.tier, condition, physioLevel).sessionRate);
        }
      }
    }
    tariffRatesNaira = [...rates].filter((rate) => rate > 0);
  }
  return tariffRatesNaira;
}

/** Package total in naira, exactly as the booking page computes it. */
function packageTotalNaira(sessionRateNaira: number, sessions: number, discountPercent: number): number {
  const discount = sessions === 1 ? 0 : discountPercent;
  const discountPerSession = Math.round(sessionRateNaira * (discount / 100));
  return (sessionRateNaira - discountPerSession) * sessions;
}

/** What the patient is charged (kobo) for a base amount in naira. */
function chargedKobo(baseNaira: number, patientBearsFee: boolean): number {
  if (patientBearsFee && baseNaira > 0) {
    const { grossKobo, feeKobo } = calculatePaystackInboundGrossAmount(Math.round(baseNaira * 100));
    if (feeKobo > 0) return Math.round(Math.round(grossKobo / 100) * 100);
  }
  return Math.round(baseNaira * 100);
}

/**
 * Returns the service amount (kobo) to record for the booking, or throws when the amount is
 * not a price this physio's booking page can show.
 */
export function resolveServiceAmountKobo(
  profile: PricedProfile,
  booking: { serviceAmountKobo: number | undefined; packageSessions?: number; isOnline?: boolean },
  settings: { paystackFeeBearerInbound?: string } | null | undefined
): number {
  const amount = booking.serviceAmountKobo ?? 0;
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new ConvexError("Invalid booking amount.");
  }
  const sessions = booking.packageSessions ?? 1;
  if (!(PACKAGE_SIZES as readonly number[]).includes(sessions)) {
    throw new ConvexError("Choose a package of 1, 4, 8 or 12 sessions.");
  }

  const hourlyNaira = profile.hourlyRate ? profile.hourlyRate / 100 : 0;
  const initialNaira = profile.initialConsultRate ? profile.initialConsultRate / 100 : 0;
  const hasOwnRate = hourlyNaira > 0 || initialNaira > 0;
  const defaultKobo = booking.isOnline
    ? profile.virtualConsultationRate || DEFAULT_VIRTUAL_KOBO
    : profile.inPersonConsultationRate || DEFAULT_IN_PERSON_KOBO;

  // No amount from the page: only physios without their own rate get the default rate.
  if (amount === 0) {
    if (hasOwnRate) throw new ConvexError("The price for this booking has changed. Please refresh the page and try again.");
    return defaultKobo;
  }

  const patientBearsFee = settings?.paystackFeeBearerInbound === "patient";
  const discountPercent = profile.packageDiscountPercent || 7;
  const candidates = new Set<number>([defaultKobo]);
  for (const rate of [hourlyNaira, ...tariffRates()]) {
    if (rate > 0) candidates.add(chargedKobo(packageTotalNaira(rate, sessions, discountPercent), patientBearsFee));
  }
  // The page falls back to the initial consultation or hourly rate when no package total exists.
  for (const rate of [initialNaira, hourlyNaira]) {
    if (rate > 0) candidates.add(chargedKobo(rate, patientBearsFee));
  }

  if (!candidates.has(amount)) {
    throw new ConvexError("The price for this booking has changed. Please refresh the page and try again.");
  }
  return amount;
}
