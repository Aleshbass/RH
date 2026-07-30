/**
 * Diagnostic script: Calls the production /api/myitura/initiate endpoint
 * to capture the exact error response body.
 *
 * Usage: node scripts/test_initiate_prod.js
 */

async function testInitiate() {
    const url = "https://physioaroundme.com/api/myitura/initiate";

    const payload = {
        firstName: "Test",
        lastName: "User",
        phoneNumber: "07061188005",
        treatment: "Physiotherapy Rehabilitation",
        treatmentAmount: 5000000, // 50,000 NGN in kobo
    };

    console.log("Calling:", url);
    console.log("Payload:", JSON.stringify(payload, null, 2));
    console.log("---");

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        console.log("HTTP Status:", res.status, res.statusText);
        console.log("Headers:", Object.fromEntries(res.headers.entries()));

        const text = await res.text();
        console.log("Response Body:", text);

        try {
            const json = JSON.parse(text);
            console.log("Parsed JSON:", JSON.stringify(json, null, 2));
        } catch {
            console.log("(Response was not valid JSON)");
        }
    } catch (err) {
        console.error("Fetch itself failed:", err);
    }
}

testInitiate();
