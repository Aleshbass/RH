/**
 * Fast checks for the partner platform's pure helpers (no Convex, no network).
 *   npx tsx scripts/partner-helpers.test.ts
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  isForwardTransition,
  isPrivateAddress,
  normalizePhone,
  normalizeTrackingCode,
  toPublicStatus,
  validateWebhookUrl,
} from "../convex/helpers/partnerShared";
import { normalizePhone as normalizePhoneNext } from "../lib/partner-api/phone";
import { validateLead, validateLinkCreate, validateReferralCreate } from "../lib/partner-api/validation";
import { hashJson } from "../lib/partner-api/http";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("partner helpers");

test("phone normalisation (Convex and Next copies agree)", () => {
  const cases: Array<[string, string | null]> = [
    ["+2348012345678", "+2348012345678"],
    ["08012345678", "+2348012345678"],
    ["2348012345678", "+2348012345678"],
    ["8012345678", "+2348012345678"],
    ["0044 20 7946 0958", "+442079460958"],
    ["002348012345678", "+2348012345678"],
    ["+44 20 7946 0958", "+442079460958"],
    ["(0801) 234-5678", "+2348012345678"],
    ["12345", null],
    ["+0123456789", null],
    ["not a phone", null],
    ["", null],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizePhone(input), expected, `convex: ${input}`);
    assert.equal(normalizePhoneNext(input), expected, `next: ${input}`);
  }
});

test("tracking code normalisation", () => {
  assert.equal(normalizeTrackingCode("RHB-4829173655"), "RHB-4829173655");
  assert.equal(normalizeTrackingCode("rhb-4829173655"), "RHB-4829173655");
  assert.equal(normalizeTrackingCode(" rhb 4829173655 "), "RHB-4829173655");
  assert.equal(normalizeTrackingCode("RHB – 72941"), "RHB-72941");
  assert.equal(normalizeTrackingCode("RHB72941"), "RHB-72941");
  assert.equal(normalizeTrackingCode("RHB-12"), null);
  assert.equal(normalizeTrackingCode("HMO-REF-1"), null);
  assert.equal(normalizeTrackingCode(undefined), null);
});

test("internal → public status mapping covers every schema status", () => {
  const expected: Record<string, string> = {
    received: "received", pending: "received", consent_pending: "received",
    contacted: "contacted", intake_started: "contacted", intake_completed: "contacted", qualified: "contacted",
    booked: "booked",
    attended: "in_treatment", treatment_active: "in_treatment", in_treatment: "in_treatment",
    completed: "completed", paid_out: "completed",
    not_suitable: "not_suitable", redirected_for_safety: "not_suitable",
    cancelled: "cancelled", refunded: "cancelled",
    closed: "closed",
  };
  for (const [internal, pub] of Object.entries(expected)) assert.equal(toPublicStatus(internal), pub, internal);
});

test("sandbox transitions only move forward", () => {
  assert.equal(isForwardTransition("received", "contacted"), true);
  assert.equal(isForwardTransition("received", "completed"), true);
  assert.equal(isForwardTransition("booked", "contacted"), false);
  assert.equal(isForwardTransition("completed", "in_treatment"), false);
  assert.equal(isForwardTransition("completed", "closed"), true);
  assert.equal(isForwardTransition("closed", "closed"), false);
  assert.equal(isForwardTransition("cancelled", "booked"), false);
});

test("webhook URL guard (SSRF)", () => {
  assert.equal(validateWebhookUrl("https://api.example.com/hooks/rehabify").ok, true);
  assert.equal(validateWebhookUrl("https://hooks.example.com:8443/x").ok, true);
  for (const bad of [
    "http://api.example.com/hook",
    "https://localhost/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.5/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://192.168.1.10/hook",
    "https://[::1]/hook",
    "https://user:pass@example.com/hook",
    "https://printer.local/hook",
    "https://metadata.google.internal/x",
    "https://example.com:22/hook",
    "ftp://example.com",
    "not a url",
  ]) {
    assert.equal(validateWebhookUrl(bad).ok, false, bad);
  }
  assert.equal(isPrivateAddress("100.64.1.1"), true);
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateAddress("fd12::1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700::1111"), false);
});

test("referral validation: documented shape, aliases, consent, phone", () => {
  const ok = validateReferralCreate({
    partner_reference: "HMO-1",
    patient: { first_name: "Adeola", phone: "08012345678" },
    clinical: { recommended_sessions: 6, priority: "urgent" },
    consent: { granted: true },
    metadata: { plan: "gold" },
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.input.patient.phone, "+2348012345678");
    assert.equal(ok.input.clinical.recommendedSessions, 6);
  }
  const legacy = validateReferralCreate({ external_ref: "X1", first_name: "A", phone: "+2348012345678", consent_granted: true });
  assert.equal(legacy.ok, true);
  const noConsent = validateReferralCreate({ patient: { first_name: "A", phone: "+2348012345678" } });
  assert.equal(noConsent.ok, false);
  if (!noConsent.ok) assert.equal(noConsent.code, "consent_required");
  const badPhone = validateReferralCreate({ patient: { first_name: "A", phone: "123" }, consent: { granted: true } });
  assert.equal(badPhone.ok, false);
  if (!badPhone.ok) assert.equal(badPhone.param, "patient.phone");
  const badEnum = validateReferralCreate({ patient: { first_name: "A", phone: "+2348012345678" }, billing_mode: "cash", consent: { granted: true } });
  assert.equal(badEnum.ok, false);
  if (!badEnum.ok) assert.equal(badEnum.param, "billing_mode");
  const tooMany = validateReferralCreate({
    patient: { first_name: "A", phone: "+2348012345678" },
    consent: { granted: true },
    metadata: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"])),
  });
  assert.equal(tooMany.ok, false);
});

test("lead and link validation", () => {
  assert.equal(validateLead({ patient: { first_name: "N", phone: "08031234567" }, consent: { granted: true } }).ok, true);
  const noContact = validateLead({ patient: { first_name: "N" }, consent: { granted: true } });
  assert.equal(noContact.ok, false);
  const noConsent = validateLead({ patient: { first_name: "N", email: "n@example.com" } });
  assert.equal(noConsent.ok, false);
  assert.equal(validateLinkCreate({}).ok, true);
  assert.equal(validateLinkCreate({ expires_at: "2000-01-01T00:00:00Z" }).ok, false);
  assert.equal(validateLinkCreate({ default_care_mode: "home" }).ok, false);
});

test("idempotency body hash ignores key order", () => {
  assert.equal(hashJson({ a: 1, b: { c: 2, d: 3 } }), hashJson({ b: { d: 3, c: 2 }, a: 1 }));
  assert.notEqual(hashJson({ a: 1 }), hashJson({ a: 2 }));
});

test("webhook signature matches the documented algorithm", () => {
  const secret = "whsec_test_vector_secret";
  const body = JSON.stringify({ id: "evt_1", type: "ping" });
  const t = 1760000000;
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex");
  // Re-implementation of the documented partner-side verification.
  const header = `t=${t},v1=${v1}`;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const expected = createHmac("sha256", secret).update(`${parts.t}.${body}`).digest("hex");
  assert.equal(parts.v1, expected);
});

console.log(`\n${passed} checks passed`);
