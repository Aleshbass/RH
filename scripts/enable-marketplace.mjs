/**
 * Enable marketplace for all approved physiotherapists
 * Run this once: node scripts/enable-marketplace.js
 */

import { ConvexHttpClient } from "convex/browser";
import apiModule from "../convex/_generated/api.js";
const { api } = apiModule;

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL not found in environment");
  process.exit(1);
}

async function enableMarketplace() {
  console.log("🚀 Enabling marketplace for approved physiotherapists...\n");

  const client = new ConvexHttpClient(CONVEX_URL);

  try {
    const result = await client.mutation(
      api.marketplace.migrations.enableMarketplaceForApprovedPhysios
    );

    console.log("✅ Migration complete!");
    console.log(`   Updated: ${result.updated} profiles`);
    console.log(`   Skipped: ${result.skipped} profiles`);
    console.log(`\n${result.message}`);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

enableMarketplace();
