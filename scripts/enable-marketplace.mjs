import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const DEPLOYMENTS = [
  "https://adept-horse-443.convex.cloud",
  "https://kindly-elk-471.convex.cloud",
];

async function runMigrationForUrl(convexUrl) {
  console.log(`\n========================================`);
  console.log(`🚀 Connecting to ${convexUrl}...`);
  console.log(`🚀 Running marketplace purge & auto-enable for all physiotherapists...`);

  const client = new ConvexHttpClient(convexUrl);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`Attempt ${attempt}/3...`);
      const result = await client.mutation(
        anyApi.marketplace.migrations.enableMarketplaceForApprovedPhysios,
        {}
      );

      console.log(`\n✅ Migration complete on ${convexUrl}!`);
      console.log(`   Total Users: ${result.totalUsers ?? "N/A"}`);
      console.log(`   Profiles Created: ${result.created ?? "N/A"}`);
      console.log(`   Profiles Updated/Enabled: ${result.updated ?? "N/A"}`);
      console.log(`   Accounts Approved: ${result.approved ?? "N/A"}`);
      console.log(`   Message: ${result.message}`);
      return;
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message || error);
      if (attempt < 3) {
        console.log("Waiting 2 seconds before retry...");
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
}

async function main() {
  for (const url of DEPLOYMENTS) {
    await runMigrationForUrl(url);
  }
  console.log(`\n🎉 All migrations completed successfully!`);
}

main();
