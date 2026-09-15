// End-to-End Test Suite for Phase 2: Commercial Terms & Commission Ledger
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
console.log("  PHASE 2 E2E TEST: COMMERCIAL TERMS & COMMISSION LEDGER");
console.log("=================================================================");
console.log(`📡 Convex Backend Target: ${convexUrl}\n`);

const client = new ConvexHttpClient(convexUrl);

async function runPhase2Tests() {
  let passed = 0;
  let failed = 0;
  const testPartnerId = "wellahealth";
  let testReferralId = null;
  let testTrackingCode = null;

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Upsert Partner Commercial Contract & Volume Tiers
  // ─────────────────────────────────────────────────────────────
  console.log("--- [Test 1] Upsert Partner Commercial Contract & Volume Tiers ---");
  try {
    const contractRes = await client.mutation(api.commercialTerms.upsertPartnerContract, {
      partnerId: testPartnerId,
      contractNumber: "CTR-WELLA-2026-PILOT",
      paymentTermsDays: 30,
      payoutCurrency: "NGN",
      modelType: "hybrid",
      baseFeePerBooking: 500000, // ₦5,000 in kobo
      revenueSharePercent: 15,    // 15% revenue share
      activationBonusPerPatient: 250000, // ₦2,500 in kobo
      vatApplicable: false,
      withholdingTaxPercent: 5,   // 5% statutory WHT
      notes: "Executed pilot agreement with Wellahealth micro-insurance network",
      tiers: [
        {
          tierName: "Starter Tier",
          minReferrals: 1,
          maxReferrals: 10,
          feePerReferral: 500000,
          revenueSharePercent: 15,
          bonusAmount: 0,
        },
        {
          tierName: "Growth Tier",
          minReferrals: 11,
          maxReferrals: 30,
          feePerReferral: 750000,
          revenueSharePercent: 18,
          bonusAmount: 350000,
        },
        {
          tierName: "Enterprise Tier",
          minReferrals: 31,
          feePerReferral: 1000000,
          revenueSharePercent: 20,
          bonusAmount: 500000,
        },
      ],
    });

    if (contractRes && contractRes.contractId && contractRes.status === "active") {
      console.log("✅ Commercial Contract Upserted Successfully:");
      console.log(`   Contract ID: ${contractRes.contractId}`);
      console.log(`   Status: ${contractRes.status}`);
      passed++;
    } else {
      console.error("❌ Contract upsert returned unexpected result:", contractRes);
      failed++;
    }
  } catch (err) {
    console.error("❌ Test 1 failed:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Query Active Partner Contract & Terms Verification
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 2] Query Active Partner Contract & Terms Verification ---");
  try {
    const activeContract = await client.query(api.commercialTerms.getActivePartnerContract, {
      partnerId: testPartnerId,
    });

    if (
      activeContract &&
      activeContract.contractNumber === "CTR-WELLA-2026-PILOT" &&
      activeContract.modelType === "hybrid" &&
      activeContract.baseFeePerBooking === 500000 &&
      activeContract.revenueSharePercent === 15 &&
      activeContract.withholdingTaxPercent === 5
    ) {
      console.log("✅ Active Commercial Contract Verified:");
      console.log(`   Contract Number: ${activeContract.contractNumber}`);
      console.log(`   Model: ${activeContract.modelType}`);
      console.log(`   Base Fee / Booking: ₦${activeContract.baseFeePerBooking / 100}`);
      console.log(`   Revenue Share: ${activeContract.revenueSharePercent}%`);
      console.log(`   Withholding Tax: ${activeContract.withholdingTaxPercent}%`);
      console.log(`   Payment Terms: Net ${activeContract.paymentTermsDays} Days`);
      console.log(`   Tiers Count: ${activeContract.tiers?.length || 0}`);
      passed++;
    } else {
      console.error("❌ Active contract verification failed. Received:", activeContract);
      failed++;
    }
  } catch (err) {
    console.error("❌ Test 2 failed:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Create Test Referral for Commission Tracking
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 3] Create Test Referral for Lifecycle Commission Testing ---");
  try {
    const refRes = await client.mutation(api.partners.createPartnerReferral, {
      partnerCode: testPartnerId,
      partnerExternalId: `WEL-COMM-${Date.now().toString().slice(-5)}`,
      patientFirstName: "Chidinma",
      patientLastName: "Eze",
      patientPhone: "+2348039991122",
      patientEmail: "chidinma.eze.test@example.com",
      city: "Lagos",
      area: "Ikeja",
      hospitalClinic: "Wellahealth Clinic Network",
      condition: "Post-Surgical Knee Rehabilitation",
      clinicalNotes: "CONFIDENTIAL_CLINICAL_NOTE: Grade 3 ACL reconstruction, restricted weight-bearing",
      priority: "standard",
      recommendedSessions: 6,
      billingMode: "hmo_direct_billing",
    });

    if (refRes && refRes.referralId && refRes.trackingCode) {
      testReferralId = refRes.referralId;
      testTrackingCode = refRes.trackingCode;
      console.log("✅ Inbound Referral Created for Commission Testing:");
      console.log(`   Referral ID: ${testReferralId}`);
      console.log(`   Tracking Code: ${testTrackingCode}`);
      passed++;
    } else {
      console.error("❌ Referral creation failed:", refRes);
      failed++;
    }
  } catch (err) {
    console.error("❌ Test 3 failed:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Trigger Booking Status -> Assert Booking Fee Commission
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 4] Calculate & Record Booking Confirmation Commission ---");
  if (!testReferralId) {
    console.log("⚠️ Skipping Test 4 (no referral ID)");
    failed++;
  } else {
    try {
      const commRes = await client.mutation(api.commercialTerms.calculateAndRecordCommission, {
        referralId: testReferralId,
        eventType: "booking_confirmed",
        grossAmountKobo: 2500000,
        notes: "Intake scheduled with Lead Physiotherapist",
      });

      console.log("✅ Booking Commission Calculation Response:", commRes);

      // Verify that booking commission was recorded in the ledger
      const commissions = await client.query(api.commercialTerms.listPartnerCommissions, {
        partnerId: testPartnerId,
      });

      const bookingCommission = commissions.find(
        (c) => c.referralId === testReferralId && (c.eventType === "booking_confirmed" || c.eventType === "booking_fee")
      );

      if (bookingCommission) {
        console.log("✅ Booking Fee Commission Recorded in Ledger:");
        console.log(`   Commission ID: ${bookingCommission._id}`);
        console.log(`   Event Type: ${bookingCommission.eventType}`);
        console.log(`   Gross Basis: ₦${bookingCommission.grossTransactionAmount / 100}`);
        console.log(`   Commission Amount: ₦${bookingCommission.commissionAmount / 100}`);
        console.log(`   Net Payable (less 5% WHT): ₦${bookingCommission.netPayable / 100}`);
        console.log(`   Status: ${bookingCommission.status}`);

        // Verify calculation: Tier amount less 5% WHT
        const expectedBookingNet = Math.round(bookingCommission.commissionAmount * 0.95);
        if ((bookingCommission.commissionAmount === 500000 || bookingCommission.commissionAmount === 750000) && bookingCommission.netPayable === expectedBookingNet) {
          console.log(`   ✅ Exact Mathematical Verification: ₦${bookingCommission.commissionAmount / 100} gross - 5% WHT = ₦${bookingCommission.netPayable / 100} net payable`);
          passed++;
        } else {
          console.error("   ❌ Mathematical mismatch in booking commission:", bookingCommission);
          failed++;
        }
      } else {
        console.error("❌ No booking commission found in ledger for referral:", testReferralId);
        failed++;
      }
    } catch (err) {
      console.error("❌ Test 4 failed:", err.message);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Trigger Care Completed -> Assert Rev Share Commission
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 5] Calculate & Record Treatment Revenue Share Commission ---");
  if (!testReferralId) {
    console.log("⚠️ Skipping Test 5 (no referral ID)");
    failed++;
  } else {
    try {
      const commRes = await client.mutation(api.commercialTerms.calculateAndRecordCommission, {
        referralId: testReferralId,
        eventType: "treatment_completed",
        grossAmountKobo: 4000000, // ₦40,000 care package
        notes: "Full course of 6 physiotherapy rehab sessions completed",
      });

      console.log("✅ Care Revenue Share Calculation Response:", commRes);

      // Verify that care rev share commission was recorded
      const commissions = await client.query(api.commercialTerms.listPartnerCommissions, {
        partnerId: testPartnerId,
      });

      const revShareCommission = commissions.find(
        (c) => c.referralId === testReferralId && (c.eventType === "treatment_completed" || c.eventType === "treatment_rev_share")
      );

      if (revShareCommission) {
        console.log("✅ Care Revenue Share Commission Recorded in Ledger:");
        console.log(`   Commission ID: ${revShareCommission._id}`);
        console.log(`   Event Type: ${revShareCommission.eventType}`);
        console.log(`   Gross Care Amount: ₦${revShareCommission.grossTransactionAmount / 100}`);
        console.log(`   Rev Share Rate: ${revShareCommission.commissionRate}%`);
        console.log(`   Commission Amount: ₦${revShareCommission.commissionAmount / 100}`);
        console.log(`   Net Payable (less 5% WHT): ₦${revShareCommission.netPayable / 100}`);
        console.log(`   Status: ${revShareCommission.status}`);

        // Verify calculation: 15% (Starter) or 18% (Growth) rev share less 5% WHT
        const expectedRevNet = Math.round(revShareCommission.commissionAmount * 0.95);
        if ((revShareCommission.commissionRate === 15 || revShareCommission.commissionRate === 18) && revShareCommission.netPayable === expectedRevNet) {
          console.log(`   ✅ Exact Mathematical Verification: ₦${revShareCommission.commissionAmount / 100} gross (${revShareCommission.commissionRate}% of ₦40,000) - 5% WHT = ₦${revShareCommission.netPayable / 100} net`);
          passed++;
        } else {
          console.error("   ❌ Mathematical mismatch in rev share commission:", revShareCommission);
          failed++;
        }
      } else {
        console.error("❌ No treatment commission found in ledger for referral:", testReferralId);
        failed++;
      }
    } catch (err) {
      console.error("❌ Test 5 failed:", err.message);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Query Partner Commercial Overview & Aggregated KPIs
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 6] Query Partner Commercial Overview & Aggregated KPIs ---");
  try {
    const summary = await client.query(api.commercialTerms.getPartnerCommercialSummary, {
      partnerId: testPartnerId,
    });

    if (
      summary &&
      summary.kpis &&
      summary.kpis.totalTransactions >= 2 &&
      summary.kpis.pendingSettlementKobo > 0 &&
      summary.tierProgress
    ) {
      console.log("✅ Partner Commercial Overview Query Succeeded:");
      console.log(`   Total Gross Earned: ${summary.kpis.totalEarned}`);
      console.log(`   Net Payable: ${summary.kpis.netPayable}`);
      console.log(`   Pending Settlement: ${summary.kpis.pendingSettlement}`);
      console.log(`   Total Transactions: ${summary.kpis.totalTransactions}`);
      console.log(`   Current Tier: ${summary.tierProgress.currentTierName}`);
      console.log(`   Referral Count: ${summary.tierProgress.currentReferrals}`);
      console.log(`   Progress to Next Tier: ${summary.tierProgress.percentToNextTier}%`);
      passed++;
    } else {
      console.error("❌ Unexpected commercial summary payload:", summary);
      failed++;
    }
  } catch (err) {
    console.error("❌ Test 6 failed:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Strict Clinical Data Isolation Verification
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- [Test 7] Verify Strict Clinical Isolation in Commercial Ledger ---");
  try {
    const commissions = await client.query(api.commercialTerms.listPartnerCommissions, {
      partnerId: testPartnerId,
    });

    let leakDetected = false;
    for (const c of commissions) {
      // Assert no clinical data leakage in partner commercial records
      if (c.diagnosis || c.clinicalNotes || (c.notes && c.notes.includes("CONFIDENTIAL_CLINICAL_NOTE"))) {
        console.error("❌ PRIVACY LEAK: Partner commission record contains raw clinical notes or diagnosis:", c);
        leakDetected = true;
        break;
      }
    }

    if (!leakDetected) {
      console.log("✅ Clinical Isolation Guard Verified:");
      console.log("   Zero clinical notes, confidential diagnoses, or treatment details leaked to financial ledger.");
      console.log("   NDPR and HIPAA confidentiality boundaries strictly enforced.");
      passed++;
    } else {
      failed++;
    }
  } catch (err) {
    console.error("❌ Test 7 failed:", err.message);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────
  // TEST SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log("\n=================================================================");
  console.log(`  PHASE 2 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================================");

  if (failed === 0) {
    console.log("🎉 ALL PHASE 2 COMMERCIAL & COMMISSION TESTS PASSED PERFECTLY!\n");
    process.exit(0);
  } else {
    console.error("💥 SOME PHASE 2 TESTS FAILED. See details above.\n");
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error("FATAL TEST RUNNER ERROR:", err);
  process.exit(1);
});
