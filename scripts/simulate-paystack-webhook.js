/*
Simulate a Paystack webhook to debug your /api/payments/webhook handler.

Usage (PowerShell):
  node ./scripts/simulate-paystack-webhook.js \
    --url http://localhost:3001/api/payments/webhook \
    --event charge.success \
    --transactionId whxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
    --amount 300000 \
    --email test@example.com \
    --name "Test User"

Notes:
- amount is in kobo (₦3,000 = 300000)
- Requires PAYSTACK_SECRET_KEY in your environment to sign the payload
  PowerShell example: $env:PAYSTACK_SECRET_KEY = "sk_test_xxx"
*/

// Load env from .env.local if present
try {
  require("dotenv").config({ path: ".env.local" });
} catch (e) {
  // dotenv optional; ignore if not installed
}

const crypto = require("node:crypto");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (!key?.startsWith("--")) continue;
    out[key.substring(2)] = val;
  }
  return out;
}

async function main() {
  const {
    url = "http://localhost:3001/api/payments/webhook",
    event = "charge.success",
    transactionId,
    amount = "300000",
    email = "tester@example.com",
    name = "Test User",
  } = parseArgs();

  if (!transactionId) {
    console.error("❌ Missing --transactionId argument");
    process.exit(1);
  }

  const firstName = String(name).split(" ")[0] || "Test";
  const body = {
    event,
    data: {
      reference: `VERIFICATION_${transactionId}_${Date.now()}`,
      amount: Number(amount),
      status: "success",
      metadata: {
        email,
        userName: name,
        custom_fields: [
          {
            display_name: "Transaction ID",
            variable_name: "transaction_id",
            value: transactionId,
          },
          {
            display_name: "Transaction Type",
            variable_name: "transaction_type",
            value: "verification_badge",
          },
        ],
      },
      customer: {
        email,
        first_name: firstName,
      },
    },
  };

  const rawBody = JSON.stringify(body);
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("❌ PAYSTACK_SECRET_KEY env var is required to sign the payload");
    process.exit(1);
  }

  const signature = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");

  console.log("\n➡️  Sending simulated Paystack webhook:");
  console.log("URL:", url);
  console.log("Event:", event);
  console.log("Reference:", body.data.reference);
  console.log("TransactionId:", transactionId);
  console.log("Signature:", signature.slice(0, 16) + "…");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": signature,
    },
    body: rawBody,
  });

  const text = await res.text();
  console.log("\n⬅️  Response:", res.status, res.statusText);
  console.log(text);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
