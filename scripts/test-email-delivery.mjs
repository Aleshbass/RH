import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL is not set in .env.local");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

async function testEmail() {
  console.log("Testing sendPartnerApplicationSubmittedAdminEmail via Convex action...");
  try {
    const result = await client.action(api.actions.emails.sendPartnerApplicationEmails.sendPartnerApplicationSubmittedAdminEmail, {
      adminEmail: process.env.PLATFORM_ADMIN_EMAIL || "admin@physioaroundme.com",
      organizationName: "Zenith Health Systems",
      organizationType: "hmo",
      contactName: "Dr. Tunde Fashola",
      contactEmail: "tunde@zenithhealth.com",
      contactPhone: "+234 801 234 5678",
      coverageStates: ["Lagos", "Abuja"],
    });

    console.log("Action result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Action error:", err);
  }
}

testEmail();
