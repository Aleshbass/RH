import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const DEPLOYMENTS = [
  { name: "Dev/Local (kindly-elk-471)", url: "https://kindly-elk-471.convex.cloud" },
  { name: "Prod (adept-horse-443)", url: "https://adept-horse-443.convex.cloud" },
];

async function checkDeployment(dep) {
  console.log(`\n======================================================`);
  console.log(`Checking ${dep.name}: ${dep.url}`);
  console.log(`======================================================`);
  const client = new ConvexHttpClient(dep.url);

  try {
    const stats = await client.query(anyApi.awadoc.getDashboardStats, {});
    console.log(`Total sessions: ${stats.totalSessions}`);
    console.log(`Events logged: ${stats.recentEvents?.length ?? 0}`);
    if (stats.recentEvents && stats.recentEvents.length > 0) {
      for (const ev of stats.recentEvents) {
        console.log(`Found Event: [${ev.eventId}] ${ev.eventType} (${ev.status})`);
        console.log(`Payload:`, JSON.stringify(ev.payload, null, 2));
      }
    }
  } catch (err) {
    console.log(`Error checking awadoc stats on ${dep.name}:`, err.message || err);
  }

  try {
    const physios = await client.query(anyApi.awadoc.getAvailablePhysios, {});
    console.log(`Physios returned (no filter): ${physios.length}`);
    physios.slice(0, 5).forEach((p, i) => {
      console.log(`  #${i+1}: ${p.firstName} ${p.lastName} | Loc: "${p.location}" | Online: ${p.offersOnlineSessions} | InPerson: ${p.offersInPersonSessions}`);
    });
  } catch (err) {
    console.log(`Error checking physios on ${dep.name}:`, err.message || err);
  }
}

async function main() {
  for (const dep of DEPLOYMENTS) {
    await checkDeployment(dep);
  }
}

main().catch(console.error);
