/**
 * Checks that the server-side price check (convex/helpers/marketplacePricing.ts) accepts
 * exactly the amounts the booking page produces, and rejects tampered amounts.
 * Run: npx tsx scripts/marketplace-pricing.test.ts
 */
import assert from "node:assert/strict";
import { CITIES, calculatePaystackInboundGrossAmount, calculateSessionPrice } from "../lib/pricing";
import { resolveServiceAmountKobo } from "../convex/helpers/marketplacePricing";

// ── Copy of the booking page's arithmetic (app/book/[physiotherapistId]/[duration]/page.tsx) ──
function pageAmountKobo(opts: {
  profile: { hourlyRate?: number; initialConsultRate?: number; packageDiscountPercent?: number }; // kobo, as stored
  prefsRate?: number; // naira from /start-treatment
  sessions: 1 | 4 | 8 | 12;
  patientBearsFee: boolean;
}): number {
  const hourly = opts.profile.hourlyRate ? opts.profile.hourlyRate / 100 : 0; // getPhysiotherapistProfile converts to naira
  const initial = opts.profile.initialConsultRate ? opts.profile.initialConsultRate / 100 : 0;
  const discountPercent = opts.profile.packageDiscountPercent || 7;
  const sessionRate = opts.prefsRate && opts.prefsRate > 0 ? opts.prefsRate : hourly || 0;
  let breakdownTotal = 0;
  if (sessionRate > 0) {
    const discount = opts.sessions === 1 ? 0 : discountPercent;
    const discountPerSession = Math.round(sessionRate * (discount / 100));
    breakdownTotal = (sessionRate - discountPerSession) * opts.sessions;
  }
  const baseAmount = breakdownTotal || initial || hourly || 0;
  let totalAmount = baseAmount;
  if (opts.patientBearsFee && baseAmount > 0) {
    const { grossKobo, feeKobo } = calculatePaystackInboundGrossAmount(Math.round(baseAmount * 100));
    if (feeKobo > 0) totalAmount = Math.round(grossKobo / 100);
  }
  return Math.round(totalAmount * 100);
}

const profiles = [
  { hourlyRate: 2_000_000, packageDiscountPercent: 10 },
  { hourlyRate: 1_234_567 }, // odd kobo value, default 7% discount
  { hourlyRate: 0, initialConsultRate: 1_500_000 },
  { hourlyRate: 3_500_000, initialConsultRate: 4_000_000, packageDiscountPercent: 15 },
];
const prefsRates: (number | undefined)[] = [undefined];
for (const city of Object.values(CITIES)) for (const area of city.areas) for (const level of ["standard", "moderate", "complex"] as const) {
  prefsRates.push(calculateSessionPrice(area.tier, level).sessionRate);
}

let accepted = 0;
for (const profile of profiles) for (const prefsRate of prefsRates) for (const sessions of [1, 4, 8, 12] as const) for (const patientBearsFee of [false, true]) {
  const amount = pageAmountKobo({ profile, prefsRate, sessions, patientBearsFee });
  if (amount === 0) continue;
  const settings = { paystackFeeBearerInbound: patientBearsFee ? "patient" : "physiotherapist" };
  const resolved = resolveServiceAmountKobo(profile, { serviceAmountKobo: amount, packageSessions: sessions, isOnline: true }, settings);
  assert.equal(resolved, amount, `legit amount rejected: ${JSON.stringify({ profile, prefsRate, sessions, patientBearsFee, amount })}`);
  accepted++;
}
console.log(`  ✓ ${accepted} legitimate page prices accepted`);

const rejects = (fn: () => unknown) => assert.throws(fn, /price for this booking has changed|Invalid booking amount|package of/);
const p = { hourlyRate: 2_000_000 };
rejects(() => resolveServiceAmountKobo(p, { serviceAmountKobo: 100, isOnline: true }, null)); // ₦1
rejects(() => resolveServiceAmountKobo(p, { serviceAmountKobo: 1_999_900, isOnline: true }, null)); // ₦1 under
rejects(() => resolveServiceAmountKobo(p, { serviceAmountKobo: -5, isOnline: true }, null));
rejects(() => resolveServiceAmountKobo(p, { serviceAmountKobo: 2_000_000, packageSessions: 3, isOnline: true }, null));
rejects(() => resolveServiceAmountKobo(p, { serviceAmountKobo: 0, isOnline: true }, null)); // ₦0 for a paid physio
console.log("  ✓ tampered amounts rejected (₦1, off-by-₦1, negative, bad package, ₦0 for a priced physio)");

assert.equal(resolveServiceAmountKobo({}, { serviceAmountKobo: 0, isOnline: true }, null), 600_000);
assert.equal(resolveServiceAmountKobo({}, { serviceAmountKobo: 0, isOnline: false }, null), 1_000_000);
assert.equal(resolveServiceAmountKobo({ inPersonConsultationRate: 1_200_000 }, { serviceAmountKobo: 0, isOnline: false }, null), 1_200_000);
console.log("  ✓ physios without a rate are booked at the default rate, never free");
