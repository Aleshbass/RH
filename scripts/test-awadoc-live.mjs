import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "https://kindly-elk-471.convex.cloud";
console.log(`Connecting to Convex: ${convexUrl}`);

const client = new ConvexHttpClient(convexUrl);

async function runDiagnostics() {
  console.log("\n=======================================================");
  console.log("🔍 1. CHECKING RECENT AWADOC EVENT LOGS IN CONVEX");
  console.log("=======================================================");
  try {
    const stats = await client.query(anyApi.awadoc.getDashboardStats, {});
    console.log(`Total AwaDoc sessions: ${stats.totalSessions}`);
    console.log(`Recent events logged: ${stats.recentEvents?.length ?? 0}`);
    if (stats.recentEvents && stats.recentEvents.length > 0) {
      console.log("\nLatest 5 events:");
      for (const ev of stats.recentEvents.slice(0, 5)) {
        console.log(`- Event ID: ${ev.eventId}`);
        console.log(`  Type: ${ev.eventType}, Direction: ${ev.direction}, Status: ${ev.status}`);
        console.log(`  Payload:`, JSON.stringify(ev.payload, null, 2));
        if (ev.responsePayload) {
          console.log(`  Response:`, JSON.stringify(ev.responsePayload, null, 2));
        }
      }
    }
  } catch (err) {
    console.error("Error fetching event logs:", err.message || err);
  }

  console.log("\n=======================================================");
  console.log("🔍 2. TESTING getAvailablePhysios QUERY DIRECTLY");
  console.log("=======================================================");
  try {
    const testCases = [
      { label: "No filters (serviceArea: undefined, preferredMode: undefined)", args: {} },
      { label: "serviceArea: 'ALL'", args: { serviceArea: "ALL" } },
      { label: "serviceArea: 'Lagos'", args: { serviceArea: "Lagos" } },
      { label: "preferredMode: 'virtual'", args: { preferredMode: "virtual" } },
      { label: "preferredMode: 'physical'", args: { preferredMode: "physical" } },
    ];

    for (const tc of testCases) {
      const result = await client.query(anyApi.awadoc.getAvailablePhysios, tc.args);
      console.log(`\nTest [${tc.label}]:`);
      console.log(`  -> Found ${result.length} physios`);
      if (result.length > 0) {
        result.forEach((p, i) => {
          console.log(`     #${i + 1}: ${p.firstName} ${p.lastName} | Rate: ₦${p.hourlyRate / 100} | Loc: "${p.location}" | Online: ${p.offersOnlineSessions} | InPerson: ${p.offersInPersonSessions}`);
        });
      }
    }
  } catch (err) {
    console.error("Error querying getAvailablePhysios:", err.message || err);
  }

  // Per-profile marketplace diagnostics need an admin session; use the Convex dashboard or
  //   npx convex run marketplace/debug:debugMarketplaceProfiles (as an admin identity).
}

runDiagnostics().catch(console.error);
