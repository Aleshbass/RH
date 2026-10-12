import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = new ConvexHttpClient(convexUrl);

async function test() {
  console.log("Checking updateReferralStatus rejects callers without an admin session...");

  // Create a test referral
  const ref = await client.mutation(api.partners.createPartnerReferral, {
    partnerCode: "wellahealth",
    patientFirstName: "Test",
    patientLastName: "AuthCheck",
    patientPhone: "+2348011223344",
    city: "Lagos",
  });

  console.log("Created test referral:", ref.referralId);

  try {
    await client.mutation(api.adminReferrals.updateReferralStatus, {
      referralId: ref.referralId,
      status: "booked",
      notes: "Should be rejected",
    });
  } catch (err) {
    console.log("Rejected as expected:", err.message);
    return;
  }

  throw new Error("updateReferralStatus accepted an unauthenticated call");
}

test().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
