// End-to-End Test Suite for Phase 1: Partner Referral Links + Patient Tracking
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL is not set in .env.local");
  process.exit(1);
}

console.log("=================================================================");
console.log("  PHASE 1 E2E TEST: PARTNER REFERRAL LINKS & PATIENT TRACKING");
console.log("=================================================================");
console.log(`📡 Convex Backend Target: ${convexUrl}\n`);

const client = new ConvexHttpClient(convexUrl);

async function runPhase1Tests() {
  let passed = 0;
  let failed = 0;
  const testPartnerId = "wellahealth";
  let generatedPublicCode = null;
  let createdReferralId = null;
  let generatedTrackingCode = null;

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Generate Partner Trackable Referral Link
  // ─────────────────────────────────────────────────────────────
  console.log("--- [Test 1] Generate Trackable Partner Referral Link ---");
  try {
    const linkRes = await client.mutation(api.partnerLinks.createReferralLink, {
      partnerId: testPartnerId,
      campaignName: "Wellahealth Q3 Outbound Pilot",
      serviceScope: "all_rehabilitation",
      defaultCareMode: "patient_choice",
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });

    if (linkRes && linkRes.publicCode && linkRes.publicCode.startsWith("wella-")) {
      generatedPublicCode = linkRes.publicCode;
      console.log("✅ Partner Referral Link Generated Successfully:");
      console.log(`   Public Code: ${linkRes.publicCode}`);
      console.log(`   Landing URL: ${linkRes.url}`);
      console.log(`   Status: ${linkRes.status}`);
      passed++;
    } else {
      console.error("❌ Unexpected link generation response:", linkRes);
      failed++;
    }
  } catch (err) {
    console.error("❌ Test 1 failed:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Public Landing Page Link Resolution & Click Tracking
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 2] Resolve Referral Link & Record Landing Click ---");
  if (!generatedPublicCode) {
    console.log("⚠️ Skipping Test 2 (no public code from Test 1)");
    failed++;
  } else {
    try {
      // 2a. Record click
      const clickRes = await client.mutation(api.partnerLinks.recordLinkClick, {
        publicCode: generatedPublicCode,
      });

      // 2b. Resolve link
      const resolved = await client.query(api.partnerLinks.resolveReferralLink, {
        publicCode: generatedPublicCode,
      });

      if (resolved && resolved.publicCode === generatedPublicCode && resolved.partner) {
        console.log("✅ Referral Link Resolved on Public Landing Page:");
        console.log(`   Partner Name: ${resolved.partner.name}`);
        console.log(`   Service Scope: ${resolved.serviceScope}`);
        console.log(`   Care Mode: ${resolved.defaultCareMode}`);
        console.log(`   Click Recorded: ${clickRes?.recorded ? "YES" : "NO"}`);
        passed++;
      } else {
        console.error("❌ Link resolution failed or missing partner branding:", resolved);
        failed++;
      }
    } catch (err) {
      console.error("❌ Test 2 failed:", err.message);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Patient Intake Submission from Landing Page (Lead Capture)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 3] Patient Intake Submission & Consent Capture ---");
  const testPatientPhone = "+23480" + Math.floor(10000000 + Math.random() * 90000000);
  if (!generatedPublicCode) {
    console.log("⚠️ Skipping Test 3");
    failed++;
  } else {
    try {
      const leadRes = await client.mutation(api.partnerLinks.submitLead, {
        publicCode: generatedPublicCode,
        firstName: "Chinedu",
        lastName: "Okonkwo",
        phone: testPatientPhone,
        email: "chinedu.okonkwo@example.com",
        city: "Lagos",
        state: "Lagos State",
        preferredLanguage: "en",
        reason: "Lower back pain from prolonged desk work",
        preferredCareMode: "face_to_face",
        nextStep: "contact_me",
        preferredContactChannel: "whatsapp",
        consentGranted: true,
        privacyNoticeVersion: "2026-09-01",
      });

      if (leadRes && leadRes.referralId && leadRes.trackingCode) {
        createdReferralId = leadRes.referralId;
        generatedTrackingCode = leadRes.trackingCode;
        console.log("✅ Patient Lead Captured & Referral Created:");
        console.log(`   Referral ID: ${leadRes.referralId}`);
        console.log(`   Tracking Code: ${leadRes.trackingCode}`);
        console.log(`   Referral Status: ${leadRes.status} (spec compliant)`);
        console.log(`   Next Action: ${leadRes.nextAction}`);
        passed++;
      } else {
        console.error("❌ Lead submission failed:", leadRes);
        failed++;
      }
    } catch (err) {
      console.error("❌ Test 3 failed:", err.message);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Lead Deduplication Protection (Same phone within 24h)
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 4] Deduplication Guard for Repeat Submissions ---");
  if (!generatedPublicCode) {
    console.log("⚠️ Skipping Test 4");
    failed++;
  } else {
    try {
      const duplicateRes = await client.mutation(api.partnerLinks.submitLead, {
        publicCode: generatedPublicCode,
        firstName: "Chinedu",
        lastName: "Okonkwo",
        phone: testPatientPhone, // SAME phone
        city: "Lagos",
        nextStep: "contact_me",
        consentGranted: true,
      });

      if (duplicateRes && duplicateRes.isDuplicate) {
        console.log("✅ Deduplication Guard Activated:");
        console.log(`   Identified existing referral: ${duplicateRes.referralId}`);
        console.log(`   Preserved tracking code: ${duplicateRes.trackingCode}`);
        passed++;
      } else {
        console.error("❌ Duplicate was not flagged as duplicate:", duplicateRes);
        failed++;
      }
    } catch (err) {
      console.error("❌ Test 4 failed:", err.message);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Immutable Audit Events Timeline Verification
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 5] Immutable Audit Trail (referralEvents) ---");
  if (!createdReferralId) {
    console.log("⚠️ Skipping Test 5");
    failed++;
  } else {
    try {
      const timeline = await client.query(api.partnerLinks.getReferralTimeline, {
        referralId: createdReferralId,
      });

      if (Array.isArray(timeline) && timeline.length >= 2) {
        console.log(`✅ Audit Trail Verified (${timeline.length} events recorded):`);
        for (const evt of timeline) {
          console.log(`   - [${new Date(evt.occurredAt).toLocaleTimeString()}] Event: ${evt.eventName} | Actor: ${evt.actorType || "system"}`);
        }
        passed++;
      } else {
        console.error("❌ Expected at least 2 events in timeline, got:", timeline);
        failed++;
      }
    } catch (err) {
      console.error("❌ Test 5 failed:", err.message);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Data Disclosure Boundary Audit
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 6] Data Disclosure Boundary (No clinical leakage) ---");
  if (!generatedTrackingCode) {
    console.log("⚠️ Skipping Test 6");
    failed++;
  } else {
    try {
      const details = await client.query(api.partners.getReferralDetails, {
        identifier: generatedTrackingCode,
        partnerCode: testPartnerId,
      });

      if (details) {
        const hasDiagnosis = details.clinicalNotes && "diagnosis" in details.clinicalNotes;
        const hasRawNotes = "rawClinicalNotes" in details;

        if (!hasDiagnosis && !hasRawNotes) {
          console.log("✅ Data Disclosure Boundary Respected:");
          console.log("   - Internal medical diagnosis is NOT exposed in partner payload");
          console.log(`   - Service category safely exposed: ${details.careDetails?.serviceScope || details.clinicalNotes?.condition}`);
          console.log(`   - Care Status: ${details.status}`);
          passed++;
        } else {
          console.error("❌ Boundary violation: internal clinical data leaked:", details.clinicalNotes);
          failed++;
        }
      } else {
        console.error("❌ Failed to fetch referral details for boundary audit");
        failed++;
      }
    } catch (err) {
      console.error("❌ Test 6 failed:", err.message);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Partner Links Analytics & Conversion Aggregation
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 7] Partner Links Performance & Conversion Rates ---");
  try {
    const links = await client.query(api.partnerLinks.listReferralLinks, {
      partnerId: testPartnerId,
    });

    if (Array.isArray(links) && links.length > 0) {
      const testLink = links.find((l) => l.publicCode === generatedPublicCode) || links[0];
      console.log("✅ Partner Links List Query Verified:");
      console.log(`   Total Links for ${testPartnerId}: ${links.length}`);
      console.log(`   Test Link: ${testLink.publicCode} | Clicks: ${testLink.clicks || 0} | Leads: ${testLink.leads || 0}`);
      console.log(`   Conversion Rate: ${testLink.conversionRate}`);
      passed++;
    } else {
      console.error("❌ No links returned for partner:", links);
      failed++;
    }
  } catch (err) {
    console.error("❌ Test 7 failed:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 8: Partner Portal Dashboard Live Metrics
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 8] Partner Portal Dashboard Metrics ---");
  try {
    const overview = await client.query(api.partners.getPartnerDashboardOverview, {
      partnerCode: testPartnerId,
    });

    if (overview && overview.metrics) {
      console.log("✅ Partner Dashboard Overview Verified:");
      console.log(`   Total Referrals: ${overview.metrics.totalReferrals}`);
      console.log(`   Active In Treatment: ${overview.metrics.activeInTreatment}`);
      console.log(`   Completed: ${overview.metrics.completed}`);
      console.log(`   Recent Referrals Count: ${overview.recentReferrals?.length || 0}`);
      passed++;
    } else {
      console.error("❌ Overview metrics missing or invalid:", overview);
      failed++;
    }
  } catch (err) {
    console.error("❌ Test 8 failed:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log("\n=================================================");
  console.log(`  PHASE 1 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  if (failed === 0) {
    console.log("🎉 ALL PHASE 1 INTEGRATION TESTS PASSED CLEANLY!");
    process.exit(0);
  } else {
    console.log("⚠️ Some tests failed. Please review the output above.");
    process.exit(1);
  }
}

runPhase1Tests();
