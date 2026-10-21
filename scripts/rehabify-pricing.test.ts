/**
 * Checks for Rehabify standard pricing (no Convex, no network):
 *   npx tsx scripts/rehabify-pricing.test.ts
 * The catalogue prices, tariff overrides, travel zones, Rehabify Access rates, the absorbed
 * Paystack fee, slot holds and the Joy service mapping.
 */
import assert from "node:assert/strict";
import {
  BOOKABLE_SERVICE_IDS,
  defaultTariffs,
  mergeTariffs,
  paystackFeeEstimateKobo,
  priceLabel,
  QuoteError,
  quoteService,
  serviceForLegacyDuration,
} from "../lib/rehabify-services";
import { zoneForArea } from "../convex/helpers/rehabifyPricing";
import { isLiveHold, overlaps } from "../convex/helpers/slotHolds";
import { joyServiceFor, JOY_CONSULTATION_SERVICES } from "../convex/helpers/joyPricing";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const naira = (amount: number) => amount * 100;
const tariffs = defaultTariffs();
const zone = { name: "Zone B", surchargeKobo: naira(5_000), physioTravelSharePercent: 100 };

console.log("rehabify pricing");

test("catalogue prices match the 19 October 2026 pricing model", () => {
  assert.deepEqual(
    Object.fromEntries(BOOKABLE_SERVICE_IDS.map((id) => [id, tariffs[id].priceKobo / 100])),
    { recovery_consultation: 6_000, virtual_assessment: 20_000, home_assessment: 30_000, virtual_treatment: 12_000, home_treatment: 30_000 }
  );
  assert.ok(!BOOKABLE_SERVICE_IDS.includes("automated_screening" as never), "screening isn't bookable yet");
});

test("virtual services: the patient pays exactly the price", () => {
  const quote = quoteService({ serviceId: "virtual_assessment", tariffs });
  assert.equal(quote.chargeKobo, naira(20_000));
  assert.equal(quote.travelSurchargeKobo, 0);
  assert.equal(quote.physioEarningsKobo, quote.payoutKobo);
});

test("Rehabify absorbs the Paystack fee: it only reduces Rehabify's share", () => {
  const quote = quoteService({ serviceId: "virtual_assessment", tariffs });
  assert.equal(quote.feeEstimateKobo, Math.round(naira(20_000) * 0.015) + naira(100));
  assert.equal(quote.rehabifyKobo, quote.chargeKobo - quote.payoutKobo - quote.feeEstimateKobo);
  assert.ok(quote.rehabifyKobo > 0, "standard margin is positive with the placeholder payouts");
});

test("Paystack fee: ₦100 waived under ₦2,500 and capped at ₦2,000", () => {
  assert.equal(paystackFeeEstimateKobo(naira(2_000)), naira(30));
  assert.equal(paystackFeeEstimateKobo(naira(6_000)), naira(190));
  assert.equal(paystackFeeEstimateKobo(naira(500_000)), naira(2_000));
  assert.equal(paystackFeeEstimateKobo(0), 0);
});

test("standard margin is positive for every service at the default tariff", () => {
  for (const id of BOOKABLE_SERVICE_IDS) {
    const quote = quoteService({ serviceId: id, tariffs, zone });
    assert.ok(quote.rehabifyKobo > 0, `${id} margin`);
  }
});

test("home treatment adds the zone's travel charge; the physio gets their share", () => {
  const quote = quoteService({ serviceId: "home_treatment", tariffs, zone });
  assert.equal(quote.chargeKobo, naira(35_000));
  assert.equal(quote.travelPhysioShareKobo, naira(5_000));
  assert.equal(quote.physioEarningsKobo, tariffs.home_treatment.payoutKobo + naira(5_000));
  const half = quoteService({ serviceId: "home_treatment", tariffs, zone: { ...zone, physioTravelSharePercent: 50 } });
  assert.equal(half.travelPhysioShareKobo, naira(2_500));
});

test("home assessment has no travel charge until an admin turns it on", () => {
  assert.equal(quoteService({ serviceId: "home_assessment", tariffs, zone }).chargeKobo, naira(30_000));
  const withTravel = mergeTariffs({ home_assessment: { travelApplies: true } });
  assert.equal(quoteService({ serviceId: "home_assessment", tariffs: withTravel, zone }).chargeKobo, naira(35_000));
});

test("home services need a zone; virtual ones ignore travel", () => {
  assert.throws(() => quoteService({ serviceId: "home_treatment", tariffs }), QuoteError);
  const virtual = mergeTariffs({ virtual_treatment: { travelApplies: true } });
  assert.equal(virtual.virtual_treatment.travelApplies, false, "travel can't apply to video sessions");
});

test("admin tariff overrides apply; inactive services can't be booked", () => {
  const custom = mergeTariffs({ virtual_treatment: { priceKobo: naira(15_000), payoutKobo: naira(10_000) }, recovery_consultation: { active: false } });
  assert.equal(quoteService({ serviceId: "virtual_treatment", tariffs: custom }).chargeKobo, naira(15_000));
  assert.throws(() => quoteService({ serviceId: "recovery_consultation", tariffs: custom }), QuoteError);
  assert.throws(() => quoteService({ serviceId: "automated_screening", tariffs }), QuoteError);
  assert.throws(() => quoteService({ serviceId: "nonsense", tariffs }), QuoteError);
});

test("bad saved values fall back to the defaults", () => {
  const custom = mergeTariffs({ virtual_assessment: { priceKobo: -5, payoutKobo: 1.5 as never } });
  assert.equal(custom.virtual_assessment.priceKobo, naira(20_000));
  assert.equal(custom.virtual_assessment.payoutKobo, tariffs.virtual_assessment.payoutKobo);
});

test("Rehabify Access uses the assisted tariff; services without one can't be assisted", () => {
  const quote = quoteService({ serviceId: "virtual_assessment", tariffs, assisted: true });
  assert.equal(quote.chargeKobo, naira(10_000));
  assert.equal(quote.payoutKobo, tariffs.virtual_assessment.assistedPayoutKobo);
  assert.equal(quote.assisted, true);
  assert.throws(() => quoteService({ serviceId: "virtual_treatment", tariffs, assisted: true }), QuoteError);
});

test("price labels show 'From' when a travel charge may be added", () => {
  assert.equal(priceLabel("home_treatment", tariffs), "From ₦30,000");
  assert.equal(priceLabel("virtual_assessment", tariffs), "₦20,000");
});

test("old booking links map to a service", () => {
  assert.equal(serviceForLegacyDuration(20), "recovery_consultation");
  assert.equal(serviceForLegacyDuration(30), "virtual_treatment");
  assert.equal(serviceForLegacyDuration(60), "virtual_assessment");
});

test("travel zones: area lookup is case-insensitive and active-only", () => {
  const zones = [
    { city: "Lagos", areas: ["Lekki", "Ajah"], active: true, name: "B" },
    { city: "Lagos", areas: ["Ikeja"], active: false, name: "A" },
  ];
  assert.equal(zoneForArea(zones, "lagos", " LEKKI ")?.name, "B");
  assert.equal(zoneForArea(zones, "Lagos", "Ikeja"), null);
  assert.equal(zoneForArea(zones, "Abuja", "Lekki"), null);
});

test("slot holds: overlap and expiry", () => {
  assert.ok(overlaps({ start: 0, end: 60 }, { start: 30, end: 90 }));
  assert.ok(!overlaps({ start: 0, end: 60 }, { start: 60, end: 90 }), "back-to-back slots don't clash");
  const now = 1_000_000;
  assert.ok(isLiveHold({ bookingStatus: "pending_payment", holdExpiresAt: now + 1 }, now));
  assert.ok(!isLiveHold({ bookingStatus: "pending_payment", holdExpiresAt: now - 1 }, now));
  assert.ok(!isLiveHold({ bookingStatus: "confirmed", holdExpiresAt: now + 1 }, now));
});

test("Joy requests map onto the catalogue", () => {
  assert.equal(JOY_CONSULTATION_SERVICES.quick_initial, "recovery_consultation");
  assert.equal(JOY_CONSULTATION_SERVICES.full_virtual, "virtual_assessment");
  assert.equal(joyServiceFor("online", { durationMinutes: 20 }), "recovery_consultation");
  assert.equal(joyServiceFor("online", { durationMinutes: 60, assessed: false }), "virtual_assessment");
  assert.equal(joyServiceFor("online", { durationMinutes: 30, assessed: true }), "virtual_treatment");
  assert.equal(joyServiceFor("home_visit", { assessed: false }), "home_assessment");
  assert.equal(joyServiceFor("home_visit", { assessed: true }), "home_treatment");
  assert.equal(joyServiceFor("clinic", {}), null, "clinic visits are the clinic's own service");
});

console.log(`\n${passed} checks passed`);
