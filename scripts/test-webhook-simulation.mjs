import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Import the webhook POST handler
const { POST } = await import("../app/api/awadoc/webhook/route.ts");
const { buildSignatureFromRaw } = await import("../lib/awadoc/awadoc.ts");

function createMockNextRequest(body, headers = {}) {
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const secretKey = process.env.AWADOC_SECRET_KEY || "";
  const signature = buildSignatureFromRaw(rawBody, timestamp, secretKey);

  const req = new Request("http://localhost:3000/api/awadoc/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-event-id": `evt-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      "x-timestamp": String(timestamp),
      "x-signature": signature,
      ...headers,
    },
    body: rawBody,
  });

  return req;
}

async function runTests() {
  console.log("==================================================================");
  console.log("🧪 SIMULATING AWADOC WEBHOOK CALLS (THERAPY & CONSULTATION)");
  console.log("==================================================================");

  const testCases = [
    {
      name: "1. therapy.availability.query (default specialist type)",
      payload: {
        event_type: "therapy.availability.query",
        meta: { query_id: `qry-${Date.now()}` },
        context: {
          service_area: "Lagos",
          schedule: { preferred_mode: "virtual" },
        },
      },
    },
    {
      name: "2. therapy.availability.query (explicit physiotherapist)",
      payload: {
        event_type: "therapy.availability.query",
        meta: { query_id: `qry-pt-${Date.now()}` },
        context: {
          specialist_type: "physiotherapist",
          service_area: "Lagos",
          schedule: { preferred_mode: "virtual" },
        },
      },
    },
    {
      name: "3. therapy.availability.query (explicit occupational-therapist)",
      payload: {
        event_type: "therapy.availability.query",
        meta: { query_id: `qry-ot-${Date.now()}` },
        context: {
          specialist_type: "occupational-therapist",
          service_area: "Lagos",
          schedule: { preferred_mode: "virtual" },
        },
      },
    },
    {
      name: "4. therapy.availability.query (explicit speech-therapist)",
      payload: {
        event_type: "therapy.availability.query",
        meta: { query_id: `qry-st-${Date.now()}` },
        context: {
          specialist_type: "speech-therapist",
          service_area: "ALL",
          schedule: { preferred_mode: "virtual" },
        },
      },
    },
    {
      name: "5. consultation.request (with physiotherapist)",
      payload: {
        event_id: `req-evt-${Date.now()}`,
        event_type: "consultation.request",
        meta: { request_id: `req-test-${Date.now()}` },
        user: { id: "awadoc-usr-123", name: "Test Patient" },
        context: {
          specialist_type: "physiotherapist",
          service_area: "Lagos",
          schedule: {
            preferred_mode: "virtual",
            preferred_time: new Date(Date.now() + 86400000).toISOString(),
            preferred_lang: "en",
          },
        },
      },
    },
    {
      name: "6. therapy.request (with occupational-therapist)",
      payload: {
        event_id: `req-ot-${Date.now()}`,
        event_type: "therapy.request",
        meta: { request_id: `req-ot-${Date.now()}` },
        user: { id: "awadoc-usr-ot", name: "Test OT Patient" },
        context: {
          specialist_type: "occupational-therapist",
          service_area: "Lagos",
          schedule: {
            preferred_mode: "virtual",
            preferred_time: new Date(Date.now() + 86400000).toISOString(),
            preferred_lang: "en",
          },
        },
      },
    },
  ];

  const ALLOWED_TYPES = new Set(["physiotherapist", "occupational-therapist", "speech-therapist"]);

  for (const tc of testCases) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`Running: ${tc.name}`);
    console.log(`Payload event_type: ${tc.payload.event_type}`);

    try {
      const req = createMockNextRequest(tc.payload);
      const res = await POST(req);
      const data = await res.json();

      console.log(`Response HTTP Status: ${res.status}`);
      console.log(`Response status field: ${data.status}`);

      if (data.specialists) {
        console.log(`Specialists returned: ${data.specialists.length}`);
        if (data.specialists.length > 0) {
          const sample = data.specialists[0];
          console.log(`Sample specialist:`, {
            name: sample.name,
            type: sample.type,
            availability_mode: sample.availability_mode,
            pricing: sample.pricing,
          });

          // Validate that all returned specialists use one of the 3 allowed types
          const invalidTypes = data.specialists.filter(s => !ALLOWED_TYPES.has(s.type));
          if (invalidTypes.length > 0) {
            console.error(`❌ INVALID SPECIALIST TYPES FOUND:`, invalidTypes.map(s => s.type));
          } else {
            console.log(`✅ All ${data.specialists.length} specialists have valid types:`, [...new Set(data.specialists.map(s => s.type))]);
          }
        }
      }

      if (data.therapy) {
        console.log(`Therapy created:`, {
          id: data.therapy.id,
          pricing: data.therapy.pricing,
          mode: data.therapy.schedule?.preferred_mode,
        });
      }

      if (res.status === 200 && data.status !== "ignored") {
        console.log(`✅ PASSED`);
      } else {
        console.error(`❌ UNEXPECTED RESPONSE:`, data);
      }
    } catch (err) {
      console.error(`❌ FAILED with error:`, err);
    }
  }

  console.log("\n==================================================================");
  console.log("🎉 All webhook simulations completed!");
  console.log("==================================================================");
}

runTests().catch(console.error);
