import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
console.log("Convex URL:", convexUrl);

if (!convexUrl) {
  console.error("Missing NEXT_PUBLIC_CONVEX_URL in .env.local");
  process.exit(1);
}

const convex = new ConvexHttpClient(convexUrl);

// 1. Test Tracking Code Extraction Regex
console.log("\n--- TEST 1: Tracking Code Extraction Regex ---");
const testCases = [
  { input: "START RHB-95942", expected: "RHB-95942" },
  { input: "START RHB-95942 - Hello Joy, I'm ready to start my intake", expected: "RHB-95942" },
  { input: "REHAB_REF_RHB-95942", expected: "RHB-95942" },
  { input: "Hello, my reference is RHB-95942 please help", expected: "RHB-95942" },
  { input: "RHB-95942", expected: "RHB-95942" },
  { input: "start rhb-95942", expected: "RHB-95942" },
  { input: "Just a random message with no code", expected: null },
];

function extractTrackingCode(text) {
  if (!text) return null;
  const startMatch = text.match(/START\s+([A-Za-z0-9_-]+)/i);
  if (startMatch) return startMatch[1].trim().toUpperCase();

  const refMatch = text.match(/REHAB_REF_([A-Za-z0-9_-]+)/i);
  if (refMatch) return refMatch[1].trim().toUpperCase();

  const rhbMatch = text.match(/\b(RHB-[A-Za-z0-9_-]+)\b/i);
  if (rhbMatch) return rhbMatch[1].trim().toUpperCase();

  return null;
}

let regexPassed = true;
for (const tc of testCases) {
  const result = extractTrackingCode(tc.input);
  const ok = result === tc.expected;
  if (!ok) {
    console.error(`FAILED: "${tc.input}" -> got ${result}, expected ${tc.expected}`);
    regexPassed = false;
  } else {
    console.log(`PASS: "${tc.input}" -> ${result}`);
  }
}

if (!regexPassed) {
  process.exit(1);
}

// 2. Query Convex for RHB-95942 (checking prod adept-horse-443 and dev kindly-elk-471)
console.log("\n--- TEST 2: Querying Referral RHB-95942 on Convex ---");
const prodConvex = new ConvexHttpClient("https://adept-horse-443.convex.cloud");
try {
  const referral = await prodConvex.query(api.partners.getReferralDetails, { identifier: "RHB-95942" });
  if (!referral) {
    console.log("Not on prod, checking dev kindly-elk-471...");
    const devReferral = await convex.query(api.partners.getReferralDetails, { identifier: "RHB-95942" });
    if (!devReferral) {
      console.log("Referral not found on dev either.");
    } else {
      console.log("Found on dev kindly-elk-471:", {
        trackingCode: devReferral.trackingCode,
        status: devReferral.status,
        patientName: `${devReferral.patient?.firstName} ${devReferral.patient?.lastName}`,
      });
    }
  } else {
    console.log("PASS: Found referral on PROD (adept-horse-443):", {
      trackingCode: referral.trackingCode,
      status: referral.status,
      patientName: `${referral.patient?.firstName} ${referral.patient?.lastName}`,
      city: referral.patient?.city,
      partnerId: referral.partnerId,
    });
  }
} catch (err) {
  console.error("Convex query failed:", err);
}

// 3. Test WhatsApp Webhook GET Verification logic
console.log("\n--- TEST 3: WhatsApp Webhook GET Verification logic ---");
function verifyWhatsAppWebhook(searchParams, expectedToken = "rehabify_whatsapp_verify_token") {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === expectedToken) {
    return { status: 200, challenge };
  }
  return { status: 403, error: "Verification failed" };
}

const params = new URLSearchParams({
  "hub.mode": "subscribe",
  "hub.verify_token": "rehabify_whatsapp_verify_token",
  "hub.challenge": "test_challenge_12345",
});

const verification = verifyWhatsAppWebhook(params);
console.log("Verification result:", verification);
if (verification.status === 200 && verification.challenge === "test_challenge_12345") {
  console.log("PASS: Webhook verification returned challenge successfully");
} else {
  console.error("FAILED: Verification mismatch");
}

console.log("\nAll unit and integration checks completed!");
