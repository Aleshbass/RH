import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import fs from "fs";
import path from "path";

let convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/NEXT_PUBLIC_CONVEX_URL=["']?([^"'\r\n]+)["']?/);
      if (match) {
        convexUrl = match[1];
      }
    }
  } catch (e) {
    console.error(e);
  }
}

if (!convexUrl) {
  convexUrl = "https://kindly-elk-471.convex.cloud";
}

async function enableMarketplace() {
  console.log(`🚀 Connecting to Convex at ${convexUrl}...`);
  console.log("🚀 Running marketplace purge & enable for all physiotherapists...\n");

  const client = new ConvexHttpClient(convexUrl);

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      console.log(`Attempt ${attempt}/5...`);
      const result = await client.mutation(
        anyApi.marketplace.migrations.enableMarketplaceForAllPhysios,
        {}
      );

      console.log("\n✅ Migration complete!");
      console.log(`   Total Users: ${result.totalUsers}`);
      console.log(`   Profiles Created: ${result.created}`);
      console.log(`   Profiles Updated/Enabled: ${result.updated}`);
      console.log(`   Accounts Approved: ${result.approved}`);
      console.log(`\n${result.message}`);
      return;
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message || error);
      if (attempt < 5) {
        console.log("Waiting 3 seconds before retry...");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  process.exit(1);
}

enableMarketplace();
