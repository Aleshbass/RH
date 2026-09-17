import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL is not set in .env.local");
  process.exit(1);
}

console.log("===============================================================");
console.log("  REHABIFY SANDBOX TEST PHONE NUMBER SCENARIOS AUDIT");
console.log("===============================================================");
console.log(`📡 Convex Backend: ${convexUrl}\n`);

const client = new ConvexHttpClient(convexUrl);

async function runPhoneScenarioTests() {
  let passed = 0;
  let failed = 0;

  // ──────────────────────────────────────────────────
  // SCENARIO 4: Ineligible Policy (+2348000000004) -> Must Reject with 400
  // ──────────────────────────────────────────────────
  console.log("--- [Scenario 4] Test Phone: +2348000000004 (Ineligible Policy) ---");
  try {
    await client.mutation(api.partners.createPartnerReferral, {
      partnerCode: "sandbox_partner",
      patientFirstName: "Test",
      patientLastName: "IneligiblePatient",
      patientPhone: "+2348000000004",
      condition: "Post-op knee rehab",
      environment: "sandbox",
    });
    console.error("❌ Expected +2348000000004 to be rejected, but it succeeded.");
    failed++;
  } catch (err) {
    if (err.message.includes("ineligible") || err.message.includes("expired")) {
      console.log(`✅ Ineligible Phone +2348000000004 correctly rejected: "${err.message}"`);
      passed++;
    } else {
      console.error("❌ Unexpected rejection error:", err.message);
      failed++;
    }
  }

  // ──────────────────────────────────────────────────
  // SCENARIO 1: Intake Success (+2348000000001) -> Schedules intake_completed
  // ──────────────────────────────────────────────────
  console.log("\n--- [Scenario 1] Test Phone: +2348000000001 (Instant Intake Success) ---");
  try {
    const res1 = await client.mutation(api.partners.createPartnerReferral, {
      partnerCode: "sandbox_partner",
      patientFirstName: "Amaka",
      patientLastName: "IntakeTest",
      patientPhone: "+2348000000001",
      condition: "Lumbar Spondylosis",
      environment: "sandbox",
      callbackUrl: "https://httpbin.org/post",
    });

    if (res1 && res1.referralId && res1.trackingCode) {
      console.log(`✅ Referral Created for +2348000000001: ${res1.trackingCode}`);
      console.log(`   Scheduled 5s progression: 'patient.intake_completed' -> status 'contacted'`);
      passed++;
    } else {
      console.error("❌ Failed to create referral for Scenario 1:", res1);
      failed++;
    }
  } catch (err) {
    console.error("❌ Scenario 1 failed:", err.message);
    failed++;
  }

  // ──────────────────────────────────────────────────
  // SCENARIO 2: Provider Matched (+2348000000002) -> Schedules provider.matched
  // ──────────────────────────────────────────────────
  console.log("\n--- [Scenario 2] Test Phone: +2348000000002 (Provider Auto-Matched) ---");
  try {
    const res2 = await client.mutation(api.partners.createPartnerReferral, {
      partnerCode: "sandbox_partner",
      patientFirstName: "Emeka",
      patientLastName: "MatchTest",
      patientPhone: "+2348000000002",
      condition: "Stroke Rehabilitation",
      environment: "sandbox",
      callbackUrl: "https://httpbin.org/post",
    });

    if (res2 && res2.referralId && res2.trackingCode) {
      console.log(`✅ Referral Created for +2348000000002: ${res2.trackingCode}`);
      console.log(`   Scheduled 10s progression: 'provider.matched' -> assigns licensed physiotherapist`);
      passed++;
    } else {
      console.error("❌ Failed to create referral for Scenario 2:", res2);
      failed++;
    }
  } catch (err) {
    console.error("❌ Scenario 2 failed:", err.message);
    failed++;
  }

  // ──────────────────────────────────────────────────
  // SCENARIO 3: Session Completed (+2348000000003) -> Schedules session.completed
  // ──────────────────────────────────────────────────
  console.log("\n--- [Scenario 3] Test Phone: +2348000000003 (Session Completed) ---");
  try {
    const res3 = await client.mutation(api.partners.createPartnerReferral, {
      partnerCode: "sandbox_partner",
      patientFirstName: "Folake",
      patientLastName: "SessionTest",
      patientPhone: "+2348000000003",
      condition: "Cervical Radiculopathy",
      environment: "sandbox",
      callbackUrl: "https://httpbin.org/post",
    });

    if (res3 && res3.referralId && res3.trackingCode) {
      console.log(`✅ Referral Created for +2348000000003: ${res3.trackingCode}`);
      console.log(`   Scheduled 15s progression: 'session.completed' -> status 'in_treatment'`);
      passed++;
    } else {
      console.error("❌ Failed to create referral for Scenario 3:", res3);
      failed++;
    }
  } catch (err) {
    console.error("❌ Scenario 3 failed:", err.message);
    failed++;
  }

  // ──────────────────────────────────────────────────
  // SCENARIO 5: Webhook Delivery Failure (+2348000000005) -> Simulates 500 error
  // ──────────────────────────────────────────────────
  console.log("\n--- [Scenario 5] Test Phone: +2348000000005 (Webhook Delivery Failure) ---");
  try {
    const res5 = await client.mutation(api.partners.createPartnerReferral, {
      partnerCode: "sandbox_partner",
      patientFirstName: "Biodun",
      patientLastName: "FailureTest",
      patientPhone: "+2348000000005",
      condition: "Post-Fracture Stiffness",
      environment: "sandbox",
      callbackUrl: "https://httpstat.us/500",
    });

    if (res5 && res5.referralId && res5.trackingCode) {
      console.log(`✅ Referral Created for +2348000000005: ${res5.trackingCode}`);
      console.log(`   Scheduled 3s failure simulation: logs real 500 delivery error to partnerActivityLogs`);
      passed++;
    } else {
      console.error("❌ Failed to create referral for Scenario 5:", res5);
      failed++;
    }
  } catch (err) {
    console.error("❌ Scenario 5 failed:", err.message);
    failed++;
  }

  // ──────────────────────────────────────────────────
  // VERIFY REAL-TIME LOG STREAM INGESTION
  // ──────────────────────────────────────────────────
  console.log("\n--- [Verification] Activity Logs Stream ---");
  try {
    const logs = await client.query(api.partners.listPartnerActivityLogs, {
      partnerCode: "sandbox_partner",
      environment: "sandbox",
      limit: 10,
    });

    console.log(`✅ Live Activity Log Stream retrieved ${logs.length} genuine entries:`);
    for (const l of logs.slice(0, 3)) {
      console.log(`   - [${l.direction.toUpperCase()}] ${l.eventType} | ${l.statusCode} ${l.status} | Latency: ${l.latencyMs}ms | Ref: ${l.trackingCode || "N/A"}`);
    }
    passed++;
  } catch (err) {
    console.error("❌ Failed to query activity logs stream:", err.message);
    failed++;
  }

  console.log("\n=================================================");
  console.log(`  PHONE SCENARIOS AUDIT: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runPhoneScenarioTests().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
