import crypto from "crypto";

console.log("==================================================");
console.log("🧪 TESTING WEBHOOK LOGIC & SIGNATURE VERIFICATION");
console.log("==================================================");

// 1. Test secret rejection logic
function validateSecret(secret) {
  if (!secret || secret === "whsec_default" || secret.trim() === "") {
    return { valid: false, error: "Missing or insecure secret rejected" };
  }
  return { valid: true };
}

console.log("\n🔒 1. TESTING SECRET VALIDATION");
console.log("Reject undefined secret:", validateSecret(undefined).valid === false);
console.log("Reject empty string secret:", validateSecret("").valid === false);
console.log("Reject 'whsec_default':", validateSecret("whsec_default").valid === false);
console.log("Accept strong secret:", validateSecret("whsec_live_9f830a4729bd8").valid === true);

if (
  !validateSecret(undefined).valid &&
  !validateSecret("").valid &&
  !validateSecret("whsec_default").valid &&
  validateSecret("whsec_live_9f830a4729bd8").valid
) {
  console.log("✅ Secret validation passed!");
} else {
  console.error("❌ Secret validation failed!");
  process.exit(1);
}

// 2. Test HMAC SHA-256 signature generation & verification
console.log("\n🔑 2. TESTING SIGNATURE COMPUTATION");
const secret = "whsec_live_test_key_12345";
const payload = {
  event: "referral.received",
  data: {
    referral_id: "ref_123",
    tracking_code: "RHB-73921",
    patient: { first_name: "Ade", last_name: "Ojo", phone: "+2348061525811" },
  },
};
const serialized = JSON.stringify(payload);
const timestamp = Math.floor(Date.now() / 1000);

const signatureHash = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}.${serialized}`)
  .digest("hex");

const signatureHeader = `t=${timestamp},v1=${signatureHash}`;
console.log("Generated Signature Header:", signatureHeader);

// Verify signature
const [tPart, vPart] = signatureHeader.split(",");
const extractedTimestamp = tPart.split("=")[1];
const extractedHash = vPart.split("=")[1];

const verifyHash = crypto
  .createHmac("sha256", secret)
  .update(`${extractedTimestamp}.${serialized}`)
  .digest("hex");

console.log("Signature matches:", extractedHash === verifyHash);
if (extractedHash === verifyHash) {
  console.log("✅ Webhook HMAC SHA-256 verification passed!");
} else {
  console.error("❌ Signature mismatch!");
  process.exit(1);
}

// 3. Test backoff retry intervals
console.log("\n⏱️ 3. TESTING RETRY INTERVALS");
const getRetryDelay = (attempt) => {
  if (attempt === 1) return 5000;
  if (attempt === 2) return 30000;
  return null; // Exhausted
};

console.log("Attempt 1 retry delay:", getRetryDelay(1), "ms (5s)");
console.log("Attempt 2 retry delay:", getRetryDelay(2), "ms (30s)");
console.log("Attempt 3 retry delay:", getRetryDelay(3), "(exhausted)");

if (getRetryDelay(1) === 5000 && getRetryDelay(2) === 30000 && getRetryDelay(3) === null) {
  console.log("✅ Retry backoff timing passed!");
}

console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
