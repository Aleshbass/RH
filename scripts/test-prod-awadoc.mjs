import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const prodUrl = "https://adept-horse-443.convex.cloud";
const client = new ConvexHttpClient(prodUrl);

async function testProd() {
  console.log("Testing Production Convex:", prodUrl);

  const testCases = [
    { label: "1. No filter", args: {} },
    { label: "2. serviceArea: 'Lagos' (exact AwaDoc request)", args: { serviceArea: "Lagos" } },
    { label: "3. preferredMode: 'virtual' (exact AwaDoc request)", args: { preferredMode: "virtual" } },
    { label: "4. serviceArea: 'Lagos' AND preferredMode: 'virtual'", args: { serviceArea: "Lagos", preferredMode: "virtual" } },
    { label: "5. preferredMode: 'physical'", args: { preferredMode: "physical" } },
  ];

  for (const tc of testCases) {
    const res = await client.query(anyApi.awadoc.getAvailablePhysios, tc.args);
    console.log(`\n================================`);
    console.log(`Test: ${tc.label}`);
    console.log(`Result count: ${res.length}`);
    if (res.length > 0) {
      console.log("First 3 matches:");
      res.slice(0, 3).forEach(p => {
        console.log(` - ${p.firstName} ${p.lastName} | Loc: "${p.location}" | Online: ${p.offersOnlineSessions} | InPerson: ${p.offersInPersonSessions}`);
      });
    }
  }

  // Let's check how many physios have location including 'lagos'
  const all = await client.query(anyApi.awadoc.getAvailablePhysios, {});
  console.log(`\n================================`);
  console.log(`ANALYSIS OF ALL ${all.length} PROD PHYSIOS:`);
  const withLagos = all.filter(p => (p.location || "").toLowerCase().includes("lagos"));
  const withOnline = all.filter(p => p.offersOnlineSessions === true);
  const withInPerson = all.filter(p => p.offersInPersonSessions === true);
  const withLagosAndOnline = all.filter(p => (p.location || "").toLowerCase().includes("lagos") && p.offersOnlineSessions === true);

  console.log(`- Physios with location containing 'lagos': ${withLagos.length}`);
  console.log(`- Physios with offersOnlineSessions == true: ${withOnline.length}`);
  console.log(`- Physios with offersInPersonSessions == true: ${withInPerson.length}`);
  console.log(`- Physios with Lagos + Online: ${withLagosAndOnline.length}`);

  if (withLagos.length > 0) {
    console.log("\nSample Lagos physios:");
    withLagos.slice(0, 5).forEach(p => console.log(`  * ${p.firstName} ${p.lastName} (${p.location}) - Online: ${p.offersOnlineSessions}, InPerson: ${p.offersInPersonSessions}`));
  }
}

testProd().catch(console.error);
