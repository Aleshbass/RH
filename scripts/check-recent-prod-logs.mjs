import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const client = new ConvexHttpClient("https://adept-horse-443.convex.cloud");

async function checkRecentLogs() {
  const stats = await client.query(anyApi.awadoc.getDashboardStats, {});
  console.log("Recent 10 events on PROD:");
  for (const ev of (stats.recentEvents || []).slice(0, 10)) {
    console.log(`\nEvent: ${ev.eventId} | ${ev.eventType} | ${new Date(ev.processedAt).toISOString()}`);
    console.log("Payload:", JSON.stringify(ev.payload, null, 2));
    console.log("Response:", JSON.stringify(ev.responsePayload, null, 2));
  }
}

checkRecentLogs().catch(console.error);
