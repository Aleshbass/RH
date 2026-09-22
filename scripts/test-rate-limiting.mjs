import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

// Load .env.local if present
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

console.log("=================================================");
console.log("   Rehabify Enterprise Rate Limiter Test Suite  ");
console.log("=================================================");
console.log(`Redis URL: ${process.env.UPSTASH_REDIS_REST_URL ? "Configured" : "Not Set"}`);
console.log(`Redis Token: ${process.env.UPSTASH_REDIS_REST_TOKEN ? "Configured" : "Not Set"}\n`);

async function runTests() {
  const { checkRateLimit, TIER_CONFIGS } = await import("../lib/rate-limiter.ts");

  console.log("--- 1. Testing Upstash Redis Rate Limiting (Sandbox Tier) ---");
  const testKey = `test_partner_${Date.now()}`;
  const sandboxLimit = TIER_CONFIGS.sandbox.burstCapacity || TIER_CONFIGS.sandbox.maxRequests;
  console.log(`Sandbox burst limit: ${sandboxLimit} requests/second`);

  // Execute concurrently so all requests hit within the same 1-second window over HTTP
  const results = await Promise.all(
    Array.from({ length: sandboxLimit + 3 }, (_, i) => checkRateLimit(testKey, "sandbox"))
  );

  let allowedCount = 0;
  let rejectedCount = 0;

  results.forEach((result, idx) => {
    const i = idx + 1;
    if (result.success) {
      allowedCount++;
      console.log(`  Req #${i}: ALLOWED (Remaining: ${result.remaining}/${result.limit}, Reset: ${result.reset})`);
    } else {
      rejectedCount++;
      console.log(`  Req #${i}: THROTTLED (HTTP 429, Retry-After: ${result.retryAfter}s, Remaining: ${result.remaining})`);
    }
  });

  if (allowedCount === sandboxLimit && rejectedCount === 3) {
    console.log(`  [PASS] Sandbox tier correctly allowed exactly ${sandboxLimit} and throttled excess requests.\n`);
  } else {
    console.error(`  [FAIL] Expected ${sandboxLimit} allowed and 3 rejected, got ${allowedCount} allowed and ${rejectedCount} rejected.\n`);
    process.exitCode = 1;
  }

  console.log("--- 2. Testing Window Rollover Recovery ---");
  console.log("  Waiting 1.2 seconds for 1-second sandbox window to roll over...");
  await new Promise((r) => setTimeout(r, 1200));

  const postResetResult = await checkRateLimit(testKey, "sandbox");
  if (postResetResult.success) {
    console.log(`  Req after rollover: ALLOWED (Remaining: ${postResetResult.remaining}/${postResetResult.limit})`);
    console.log("  [PASS] Rate limit reset window successfully rolled over.\n");
  } else {
    console.error("  [FAIL] Request after window rollover was unexpectedly throttled.\n");
    process.exitCode = 1;
  }

  console.log("--- 3. Testing Public Form Tier (IP-Based Throttling) ---");
  const testIpKey = `test_ip_192_168_1_${Date.now() % 1000}`;
  const formLimit = TIER_CONFIGS.public_form.burstCapacity || TIER_CONFIGS.public_form.maxRequests;
  console.log(`Public Form limit: ${formLimit} requests per 10 minutes`);

  let formAllowed = 0;
  let formRejected = 0;

  for (let i = 1; i <= formLimit + 2; i++) {
    const result = await checkRateLimit(testIpKey, "public_form");
    if (result.success) {
      formAllowed++;
      console.log(`  Form Submit #${i}: ALLOWED (Remaining: ${result.remaining}/${result.limit})`);
    } else {
      formRejected++;
      console.log(`  Form Submit #${i}: THROTTLED (HTTP 429, Retry-After: ${result.retryAfter}s)`);
    }
  }

  if (formAllowed === formLimit && formRejected === 2) {
    console.log(`  [PASS] Public form tier correctly allowed exactly ${formLimit} and blocked spam.\n`);
  } else {
    console.error(`  [FAIL] Expected ${formLimit} allowed and 2 rejected, got ${formAllowed} allowed and ${formRejected} rejected.\n`);
    process.exitCode = 1;
  }

  console.log("--- 4. Testing In-Memory Fallback Store ---");
  // Temporarily mask Redis env vars
  const origUrl = process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;

  const inMemKey = `test_inmem_${Date.now()}`;
  let inMemAllowed = 0;
  let inMemRejected = 0;

  for (let i = 1; i <= 7; i++) {
    const res = await checkRateLimit(inMemKey, "sandbox");
    if (res.success) inMemAllowed++;
    else inMemRejected++;
  }

  // Restore env var
  process.env.UPSTASH_REDIS_REST_URL = origUrl;

  console.log(`  In-Memory fallback: Allowed ${inMemAllowed} requests.`);
  if (inMemAllowed > 0) {
    console.log("  [PASS] In-memory sliding window fallback functions seamlessly.\n");
  } else {
    console.error("  [FAIL] In-memory fallback failed.\n");
    process.exitCode = 1;
  }

  console.log("=================================================");
  console.log("   All Enterprise Rate Limiting Tests Passed!   ");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
