import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const client = new ConvexHttpClient(convexUrl);

async function test() {
  console.log("Testing updateReferralStatus directly without Clerk session...");
  
  // Create a test referral
  const ref = await client.mutation(api.partners.createPartnerReferral, {
    partnerCode: "wellahealth",
    patientFirstName: "Test",
    patientLastName: "AuthFallback",
    patientPhone: "+2348011223344",
    city: "Lagos",
  });

  console.log("Created test referral:", ref.referralId);

  // Call updateReferralStatus
  const updated = await client.mutation(api.adminReferrals.updateReferralStatus, {
    referralId: ref.referralId,
    status: "booked",
    notes: "Verified via fallback actor",
  });

  console.log("Successfully updated referral status:", updated);
  console.log("All systems operational!");
}

test().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
