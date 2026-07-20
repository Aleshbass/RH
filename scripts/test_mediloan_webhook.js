/**
 * Mediloan Integration Test Script
 * =================================
 * Tests the MyItura MediLoan integration endpoints.
 *
 * Usage:
 *   node scripts/test_mediloan_webhook.js [BASE_URL]
 *
 * Defaults to http://localhost:3000 if no BASE_URL is provided.
 *
 * What it tests:
 *   WEBHOOK ENDPOINT (/api/myitura/webhook)
 *   1.  Health check (GET)
 *   2.  Rejects requests with no API key
 *   3.  Rejects requests with invalid API key
 *   4.  Handles unknown event types gracefully (requires MYITURA_PUBLIC_KEY env)
 *   5.  Rejects missing sdkReference + clientReference (requires MYITURA_PUBLIC_KEY env)
 *
 *   PATIENT SELF-SERVICE (/api/myitura/patient-initiate)
 *   6.  Rejects missing required fields
 *   7.  Rejects invalid phone number format
 *   8.  Rejects non-positive treatmentAmount
 *
 *   PHYSIO-INITIATED (/api/myitura/initiate) — requires auth
 *   9.  Rejects unauthenticated requests
 *
 *   FRONTEND
 *   10. Landing page is accessible and contains MediLoan content
 *   11. Booking page route is accessible
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function runTest(name, fn) {
    process.stdout.write(`  ${CYAN}⧗${RESET} ${name}...`);
    try {
        const result = await fn();
        if (result === "SKIP") return; // already counted in fn
        passed++;
        process.stdout.write(`\r  ${GREEN}✓${RESET} ${name}${" ".repeat(Math.max(0, 60 - name.length))}\n`);
    } catch (err) {
        failed++;
        process.stdout.write(`\r  ${RED}✗${RESET} ${name}${" ".repeat(Math.max(0, 60 - name.length))}\n`);
        console.log(`     ${RED}↳ ${err.message}${RESET}`);
    }
}

function skip(name, reason) {
    skipped++;
    console.log(`  ${YELLOW}⊘${RESET} ${name} ${DIM}(skipped — ${reason})${RESET}`);
}

// ─── Webhook Tests ───────────────────────────────────────────────────────────

async function testWebhookHealthCheck() {
    const res = await fetch(`${BASE_URL}/api/myitura/webhook`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.status === "ok", `Expected status 'ok', got '${body.status}'`);
    assert(body.service === "rehabify-myitura-webhook", `Wrong service name: ${body.service}`);
}

async function testWebhookRejectsNoKey() {
    const res = await fetch(`${BASE_URL}/api/myitura/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "loan.approved", sdkReference: "TEST12345X" }),
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    const body = await res.json();
    assert(body.error === "Unauthorized", `Expected 'Unauthorized', got '${body.error}'`);
}

async function testWebhookRejectsInvalidKey() {
    const res = await fetch(`${BASE_URL}/api/myitura/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Public-Key": "WRONG_KEY_9999" },
        body: JSON.stringify({ event: "loan.approved", sdkReference: "TEST12345X" }),
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
}

async function testWebhookHandlesUnknownEvent() {
    const publicKey = process.env.MYITURA_PUBLIC_KEY;
    if (!publicKey) {
        skip("Webhook handles unknown event types", "MYITURA_PUBLIC_KEY not set");
        return "SKIP";
    }
    const res = await fetch(`${BASE_URL}/api/myitura/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Public-Key": publicKey },
        body: JSON.stringify({ event: "loan.unknown_xyz", sdkReference: "TEST12345X" }),
    });
    assert(res.ok, `Expected 200 for unknown event, got ${res.status}`);
    const body = await res.json();
    assert(body.received === true, `Expected received:true, got ${JSON.stringify(body)}`);
    assert(body.warning, "Expected a warning field for unknown event type");
}

async function testWebhookRejectsMissingRef() {
    const publicKey = process.env.MYITURA_PUBLIC_KEY;
    if (!publicKey) {
        skip("Webhook rejects missing references", "MYITURA_PUBLIC_KEY not set");
        return "SKIP";
    }
    const res = await fetch(`${BASE_URL}/api/myitura/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Public-Key": publicKey },
        body: JSON.stringify({ event: "loan.approved" }), // no sdkReference or clientReference
    });
    assert(res.status === 400, `Expected 400 for missing reference, got ${res.status}`);
}

// ─── Patient Self-Service Tests ───────────────────────────────────────────────

async function testPatientInitiateMissingFields() {
    const res = await fetch(`${BASE_URL}/api/myitura/patient-initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            // missing: firstName, lastName, phoneNumber, treatment, treatmentAmount
        }),
    });
    assert(res.status === 400, `Expected 400 for missing fields, got ${res.status}`);
    const body = await res.json();
    assert(body.error, `Expected an error message, got ${JSON.stringify(body)}`);
}

async function testPatientInitiateInvalidPhone() {
    const res = await fetch(`${BASE_URL}/api/myitura/patient-initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            firstName: "Test",
            lastName: "Patient",
            phoneNumber: "12345", // invalid
            treatment: "Physiotherapy",
            treatmentAmount: 50000,
        }),
    });
    assert(res.status === 400, `Expected 400 for invalid phone, got ${res.status}`);
    const body = await res.json();
    assert(body.error?.toLowerCase().includes("phone"), `Expected phone error, got: ${body.error}`);
}

async function testPatientInitiateInvalidAmount() {
    const res = await fetch(`${BASE_URL}/api/myitura/patient-initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            firstName: "Test",
            lastName: "Patient",
            phoneNumber: "08012345678",
            treatment: "Physiotherapy",
            treatmentAmount: -500, // invalid
        }),
    });
    assert(res.status === 400, `Expected 400 for negative amount, got ${res.status}`);
}

// ─── Physio-initiated auth test ───────────────────────────────────────────────

async function testPhysioInitiateRejectsNoAuth() {
    const res = await fetch(`${BASE_URL}/api/myitura/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            firstName: "Test",
            lastName: "Patient",
            phoneNumber: "08012345678",
            treatment: "Physiotherapy",
            treatmentAmount: 50000,
        }),
    });
    assert(res.status === 401, `Expected 401 Unauthenticated for physio route, got ${res.status}`);
    const body = await res.json();
    assert(body.error === "Unauthenticated", `Expected 'Unauthenticated', got '${body.error}'`);
}

// ─── Frontend Tests ───────────────────────────────────────────────────────────

async function testLandingPageHasMediLoan() {
    const res = await fetch(`${BASE_URL}/`);
    assert(res.ok, `Landing page returned ${res.status}`);
    const html = await res.text();
    assert(
        html.toLowerCase().includes("mediloan") || html.includes("MediLoan") || html.includes("myitura"),
        "Landing page HTML does not reference MediLoan"
    );
}

async function testBookingPageAccessible() {
    const res = await fetch(`${BASE_URL}/book/test-slug`);
    assert(res.ok, `Booking page returned ${res.status}`);
    const html = await res.text();
    assert(html.includes("<html"), "Booking page did not return valid HTML");
}

// ─── Main runner ──────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${BOLD}  MediLoan Integration Test Suite${RESET}`);
    console.log(`${DIM}  Target: ${BASE_URL}${RESET}`);
    console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

    console.log(`${BOLD}  Webhook Endpoint  (/api/myitura/webhook)${RESET}`);
    await runTest("Health check (GET)", testWebhookHealthCheck);
    await runTest("Rejects POST with no API key", testWebhookRejectsNoKey);
    await runTest("Rejects POST with invalid API key", testWebhookRejectsInvalidKey);
    await runTest("Handles unknown event types gracefully", testWebhookHandlesUnknownEvent);
    await runTest("Rejects missing sdkReference & clientReference", testWebhookRejectsMissingRef);

    console.log(`\n${BOLD}  Patient Self-Service  (/api/myitura/patient-initiate)${RESET}`);
    await runTest("Rejects request with missing required fields", testPatientInitiateMissingFields);
    await runTest("Rejects invalid phone number format", testPatientInitiateInvalidPhone);
    await runTest("Rejects non-positive treatmentAmount", testPatientInitiateInvalidAmount);

    console.log(`\n${BOLD}  Physio-Initiated  (/api/myitura/initiate)${RESET}`);
    await runTest("Rejects unauthenticated requests", testPhysioInitiateRejectsNoAuth);

    console.log(`\n${BOLD}  Frontend Pages${RESET}`);
    await runTest("Landing page contains MediLoan content", testLandingPageHasMediLoan);
    await runTest("Booking page route is accessible", testBookingPageAccessible);

    const total = passed + failed + skipped;
    console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(
        `  ${BOLD}Results:${RESET}  ` +
        `${GREEN}${passed} passed${RESET}  ` +
        `${failed > 0 ? RED : DIM}${failed} failed${RESET}  ` +
        `${skipped > 0 ? YELLOW : DIM}${skipped} skipped${RESET}  ` +
        `${DIM}(${total} total)${RESET}`
    );
    console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(`\n${RED}Fatal:${RESET}`, err.message);
    process.exit(1);
});
