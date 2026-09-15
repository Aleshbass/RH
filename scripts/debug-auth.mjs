import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

async function testAuth() {
  try {
    console.log("Testing validatePartnerApiKey with 'sk_test_rehabify_sandbox'...");
    const result = await client.query(api.partners.validatePartnerApiKey, {
      apiKey: "sk_test_rehabify_sandbox",
    });
    console.log("Result:", result);

    console.log("Testing with invalid key...");
    const invalid = await client.query(api.partners.validatePartnerApiKey, {
      apiKey: "sk_invalid_123",
    });
    console.log("Invalid key result (should be null):", invalid);
  } catch (err) {
    console.error("Error details:", err);
  }
}

testAuth();
