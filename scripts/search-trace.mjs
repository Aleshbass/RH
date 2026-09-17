import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

async function searchAllLogs(name, url) {
  console.log(`\nSearching ${name} (${url})...`);
  const client = new ConvexHttpClient(url);
  try {
    const stats = await client.query(anyApi.awadoc.getDashboardStats, {});
    const events = stats.recentEvents || [];
    console.log(`Total events fetched: ${events.length}`);
    const match = events.find(e => 
      JSON.stringify(e).includes("69bea8") || 
      JSON.stringify(e).includes("my-69bea8971ffc2c5a36799897-trace") ||
      new Date(e.processedAt).toISOString().startsWith("2026-09-16")
    );
    if (match) {
      console.log("MATCH FOUND!", JSON.stringify(match, null, 2));
    } else {
      console.log("No match found for 69bea8 or 2026-09-16.");
      if (events.length > 0) {
        console.log("Most recent event date:", new Date(events[0].processedAt).toISOString());
      }
    }
  } catch (err) {
    console.log(`Error on ${name}:`, err.message);
  }
}

async function main() {
  await searchAllLogs("DEV", "https://kindly-elk-471.convex.cloud");
  await searchAllLogs("PROD", "https://adept-horse-443.convex.cloud");
}

main();
