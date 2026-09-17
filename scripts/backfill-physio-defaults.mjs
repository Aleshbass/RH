import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const DEPLOYMENTS = [
  { name: "Dev (kindly-elk-471)", url: "https://kindly-elk-471.convex.cloud" },
  { name: "Prod (adept-horse-443)", url: "https://adept-horse-443.convex.cloud" },
];

async function migrateDeployment(dep) {
  console.log(`\n======================================================`);
  console.log(`🚀 Backfilling Physiotherapist Defaults on ${dep.name}`);
  console.log(`   URL: ${dep.url}`);
  console.log(`======================================================`);

  const client = new ConvexHttpClient(dep.url);

  // 1. Pre-migration check
  try {
    const before = await client.query(anyApi.awadoc.getAvailablePhysios, {});
    const onlineBefore = before.filter((p) => p.offersOnlineSessions === true).length;
    const inPersonBefore = before.filter((p) => p.offersInPersonSessions === true).length;
    console.log(`📊 BEFORE migration:`);
    console.log(`   Total Marketplace Available: ${before.length}`);
    console.log(`   Offers Online Sessions:      ${onlineBefore}/${before.length}`);
    console.log(`   Offers In-Person Sessions:   ${inPersonBefore}/${before.length}`);
  } catch (err) {
    console.warn(`   ⚠️ Could not fetch pre-migration stats: ${err.message || err}`);
  }

  // 2. Run migration with retries
  let migrationSuccess = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`\n⏳ Running migration (Attempt ${attempt}/3)...`);
      const result = await client.mutation(
        anyApi.marketplace.migrations.enableMarketplaceForApprovedPhysios,
        {}
      );

      console.log(`✅ Mutation completed successfully!`);
      console.log(`   Total Profiles Scanned:  ${result.totalProfiles ?? "N/A"}`);
      console.log(`   Updated Profiles:        ${result.updated ?? "N/A"}`);
      console.log(`   Already Up to Date:      ${result.alreadyEnabled ?? result.alreadyCorrect ?? "N/A"}`);
      console.log(`   Message:                 ${result.message ?? "Done"}`);
      migrationSuccess = true;
      break;
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed: ${err.message || err}`);
      if (attempt < 3) {
        console.log(`   Waiting 3s before retry...`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  if (!migrationSuccess) {
    console.error(`❌ Migration failed for ${dep.name} after 3 attempts.`);
    return;
  }

  // 3. Post-migration verification
  try {
    const after = await client.query(anyApi.awadoc.getAvailablePhysios, {});
    const onlineAfter = after.filter((p) => p.offersOnlineSessions === true).length;
    const inPersonAfter = after.filter((p) => p.offersInPersonSessions === true).length;
    console.log(`\n📊 AFTER migration:`);
    console.log(`   Total Marketplace Available: ${after.length}`);
    console.log(`   Offers Online Sessions:      ${onlineAfter}/${after.length}`);
    console.log(`   Offers In-Person Sessions:   ${inPersonAfter}/${after.length}`);

    // Sample top 5 physios
    console.log(`\n👀 Sample 5 Physiotherapists:`);
    after.slice(0, 5).forEach((p, idx) => {
      console.log(
        `   #${idx + 1}: ${p.firstName || "(no first name)"} ${p.lastName || "(no last name)"} | ` +
        `Loc: "${p.location || ""}" | Online: ${p.offersOnlineSessions} | InPerson: ${p.offersInPersonSessions}`
      );
    });
  } catch (err) {
    console.warn(`   ⚠️ Could not fetch post-migration verification: ${err.message || err}`);
  }
}

async function main() {
  console.log("==================================================================");
  console.log("🌟 PHYSIOTHERAPIST AVAILABILITY DEFAULTS BACKFILL SCRIPT");
  console.log("   Targeting Dev and Prod Convex Deployments");
  console.log("==================================================================");

  for (const dep of DEPLOYMENTS) {
    await migrateDeployment(dep);
  }

  console.log("\n🎉 All deployments processed!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
