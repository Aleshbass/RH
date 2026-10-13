#!/usr/bin/env node
/**
 * End-to-end smoke test of the partner REST API against a deployed environment.
 *
 *   PARTNER_API_BASE=https://api.physioaroundme.com/v1 \
 *   PARTNER_SANDBOX_KEY=sk_test_xxxxxxxx \
 *   node scripts/partner-api-smoke-test.mjs
 *
 * Uses ONLY a sandbox key: creates sandbox referrals (no real patients are contacted,
 * no commissions). Optional: PARTNER_LIVE_KEY to check live-only behaviour (read-only).
 */
const BASE = (process.env.PARTNER_API_BASE || "https://api.physioaroundme.com/v1").replace(/\/$/, "");
const KEY = process.env.PARTNER_SANDBOX_KEY;
const LIVE_KEY = process.env.PARTNER_LIVE_KEY;
if (!KEY) {
  console.error("Set PARTNER_SANDBOX_KEY (create one in the Partner Portal → Developers → API keys).");
  process.exit(2);
}

let failures = 0;
const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition) });
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(method, path, { key = KEY, body, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json().catch(() => null) : await response.arrayBuffer();
  return { status: response.status, headers: response.headers, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unique = `SMOKE-${Date.now()}`;

console.log(`Partner API smoke test → ${BASE}\n`);

console.log("Authentication & errors");
{
  const r = await call("GET", "/partners/referrals", { key: null });
  check("missing key → 401 missing_api_key", r.status === 401 && r.data?.error?.code === "missing_api_key", JSON.stringify(r.data));
  check("error has type, request_id and doc_url", r.data?.error?.type === "authentication_error" && r.data?.error?.request_id && r.data?.error?.doc_url);
  check("X-Request-Id header", Boolean(r.headers.get("x-request-id")));
  const bad = await call("GET", "/partners/referrals", { key: "sk_test_" + "x".repeat(40) });
  check("unknown key → 401 invalid_api_key", bad.status === 401 && bad.data?.error?.code === "invalid_api_key");
  const json = await call("POST", "/partners/referrals", { body: "{not json" });
  check("malformed JSON → 400 invalid_json", json.status === 400 && json.data?.error?.code === "invalid_json", JSON.stringify(json.data));
  const nf = await call("GET", "/partners/does-not-exist");
  check("unknown endpoint → 404 resource_not_found", nf.status === 404 && nf.data?.error?.code === "resource_not_found");
}

console.log("\nReferrals");
let referral;
{
  const body = {
    partner_reference: unique,
    patient: { first_name: "Smoke", last_name: "Test", phone: "08012345678", city: "Lagos" },
    clinical: { condition: "Lower back pain", notes: "write-only", recommended_sessions: 4 },
    care: { preferred_mode: "remote", preferred_contact_channel: "whatsapp" },
    consent: { granted: true, method: "electronic" },
    metadata: { suite: "smoke" },
  };
  const noConsent = await call("POST", "/partners/referrals", { body: { ...body, consent: { granted: false } } });
  check("consent.granted=false → 422 consent_required", noConsent.status === 422 && noConsent.data?.error?.code === "consent_required");
  const badPhone = await call("POST", "/partners/referrals", { body: { ...body, patient: { first_name: "X", phone: "123" } } });
  check("bad phone → 422 validation_error param=patient.phone", badPhone.status === 422 && badPhone.data?.error?.param === "patient.phone");

  const idem = `idem-${unique}`;
  const created = await call("POST", "/partners/referrals", { body, headers: { "Idempotency-Key": idem } });
  referral = created.data;
  check("create → 201 Referral", created.status === 201 && referral?.object === "referral", JSON.stringify(created.data));
  check("environment is sandbox", referral?.environment === "sandbox");
  check("tracking code RHB-<10 digits>", /^RHB-\d{10}$/.test(referral?.tracking_code || ""));
  check("phone normalised to E.164", referral?.patient?.phone === "+2348012345678");
  check("clinical notes never returned", referral?.clinical && !("notes" in referral.clinical));
  check("links use the public site", referral?.links?.tracking_url?.startsWith("https://physioaroundme.com/track/") || referral?.links?.tracking_url?.includes("/track/"));
  check("rate-limit headers", Boolean(created.headers.get("x-ratelimit-limit")));

  const replay = await call("POST", "/partners/referrals", { body, headers: { "Idempotency-Key": idem } });
  check("same Idempotency-Key + body → replay", replay.status === 201 && replay.headers.get("idempotent-replayed") === "true" && replay.data?.id === referral?.id);
  const reused = await call("POST", "/partners/referrals", { body: { ...body, partner_reference: `${unique}-b` }, headers: { "Idempotency-Key": idem } });
  check("same key + different body → 422 idempotency_key_reused", reused.status === 422 && reused.data?.error?.code === "idempotency_key_reused");
  const dup = await call("POST", "/partners/referrals", { body });
  check("duplicate partner_reference → 409 with existing id", dup.status === 409 && dup.data?.error?.existing?.id === referral?.id);

  for (const id of [referral?.id, referral?.tracking_code, unique]) {
    const got = await call("GET", `/partners/referrals/${encodeURIComponent(id)}`);
    check(`get by ${id === unique ? "partner_reference" : id === referral?.id ? "id" : "tracking code"}`, got.status === 200 && got.data?.id === referral?.id);
  }
  const list = await call("GET", `/partners/referrals?limit=1`);
  check("list envelope", list.status === 200 && list.data?.object === "list" && Array.isArray(list.data?.data) && "next_cursor" in list.data);
  if (list.data?.next_cursor) {
    const page2 = await call("GET", `/partners/referrals?limit=1&cursor=${encodeURIComponent(list.data.next_cursor)}`);
    check("cursor pagination", page2.status === 200 && page2.data?.data?.[0]?.id !== list.data.data[0]?.id);
  }
  const badLimit = await call("GET", `/partners/referrals?limit=500`);
  check("limit>100 → 400 invalid_parameter", badLimit.status === 400 && badLimit.data?.error?.param === "limit");
}

console.log("\nSandbox lifecycle");
{
  const ineligible = await call("POST", "/partners/referrals", {
    body: { patient: { first_name: "Inel", phone: "+2348000000004" }, consent: { granted: true } },
  });
  check("+2348000000004 → 422 patient_ineligible", ineligible.status === 422 && ineligible.data?.error?.code === "patient_ineligible");

  const journey = await call("POST", "/partners/referrals", {
    body: { partner_reference: `${unique}-journey`, patient: { first_name: "Journey", phone: "+2348000000003" }, consent: { granted: true } },
  });
  check("journey referral created", journey.status === 201);
  process.stdout.write("  … waiting 40s for the simulated journey\n");
  await sleep(40_000);
  const after = await call("GET", `/partners/referrals/${journey.data?.id}`);
  check("journey reached completed", after.data?.status === "completed", after.data?.status);
  check("provider simulated", after.data?.provider?.name === "Sandbox Physiotherapist");

  const advance = await call("POST", `/sandbox/referrals/${referral?.id}/advance`, { body: { status: "booked" } });
  check("advance → booked", advance.status === 200 && advance.data?.status === "booked", JSON.stringify(advance.data?.error ?? ""));
  const back = await call("POST", `/sandbox/referrals/${referral?.id}/advance`, { body: { status: "contacted" } });
  check("backwards transition → 422 invalid_status_transition", back.status === 422 && back.data?.error?.code === "invalid_status_transition");

  const sessions = await call("GET", `/partners/sessions?referral_id=${referral?.id}`);
  check("sessions list (simulated)", sessions.status === 200 && sessions.data?.data?.every?.((s) => s.simulated === true));
  const report = await call("GET", `/partners/reports/${referral?.tracking_code}`);
  check("report object, no clinical notes", report.status === 200 && report.data?.object === "report" && !JSON.stringify(report.data).includes("write-only"));
  const pdf = await call("GET", `/partners/reports/${referral?.tracking_code}/pdf`);
  const pdfHead = pdf.data instanceof ArrayBuffer ? Buffer.from(pdf.data).subarray(0, 5).toString() : "";
  check("report PDF is a real PDF", pdf.status === 200 && pdf.headers.get("content-type") === "application/pdf" && pdfHead === "%PDF-");

  const hook = await call("POST", "/sandbox/trigger-webhook", { body: { type: "ping" } });
  check("trigger-webhook → 202 queued or 409 not configured", hook.status === 202 || (hook.status === 409 && hook.data?.error?.code === "webhook_endpoint_not_configured"));
}

console.log("\nReferral links, providers, commercial");
{
  const link = await call("POST", "/partners/referral-links", { body: { campaign_name: `Smoke ${unique}` } });
  check("create link → 201", link.status === 201 && link.data?.object === "referral_link" && link.data?.environment === "sandbox");
  check("link URL on the public site", /\/r\/[a-z0-9]+-[A-Z0-9]{8}$/.test(link.data?.url || ""), link.data?.url);
  const off = await call("PATCH", `/partners/referral-links/${link.data?.id}`, { body: { status: "inactive" } });
  check("deactivate link", off.status === 200 && off.data?.status === "inactive");
  const lead = await fetch(`${BASE}/public/referral-links/${link.data?.public_code}/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patient: { first_name: "Lead", phone: "+2348099999999" }, consent: { granted: true } }),
  });
  check("lead on inactive link → 410", lead.status === 410);
  const providers = await call("GET", "/partners/providers?limit=5");
  check("providers list", providers.status === 200 && providers.data?.object === "list");
  const commercial = await call("GET", "/partners/commercial");
  check("commercial terms", commercial.status === 200 && commercial.data?.object === "commercial_terms" && commercial.data?.earnings?.earned_kobo === 0);
  const commissions = await call("GET", "/partners/commissions");
  check("sandbox commissions are empty", commissions.status === 200 && commissions.data?.data?.length === 0);
  const elig = await call("POST", "/partners/eligibility", { body: { member_id: "WH-1" } });
  check("sandbox eligibility is simulated", elig.status === 200 && elig.data?.simulated === true);
}

if (LIVE_KEY) {
  console.log("\nLive key (read-only)");
  const elig = await call("POST", "/partners/eligibility", { key: LIVE_KEY, body: { member_id: "WH-1" } });
  check("live eligibility → 501 feature_not_available", elig.status === 501 && elig.data?.error?.code === "feature_not_available");
  const sandboxOnly = await call("POST", "/sandbox/trigger-webhook", { key: LIVE_KEY, body: { type: "ping" } });
  check("sandbox endpoint with live key → 403 sandbox_only", sandboxOnly.status === 403 && sandboxOnly.data?.error?.code === "sandbox_only");
  const isolation = await call("GET", `/partners/referrals/${referral?.id}`, { key: LIVE_KEY });
  check("sandbox referral invisible to live key", isolation.status === 404);
}

console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
