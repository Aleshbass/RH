const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const { MYITURA_PUBLIC_KEY, MYITURA_SECRET_KEY } = process.env;
const MYITURA_API_URL = "https://devloansapi.myitura.com";

console.log("Keys loaded:");
console.log("URL:", MYITURA_API_URL);
console.log("Public Key:", MYITURA_PUBLIC_KEY);
console.log("Secret Key:", MYITURA_SECRET_KEY ? "Loaded" : "Missing");

async function testSDK() {
    const payload = {
        clientReference: "TEST-LOAN-" + Date.now(),
        firstName: "Paul",
        lastName: "Francis",
        phoneNumber: "07061188005", // The number provided by the user
        treatment: "Physiotherapy Rehabilitation",
        treatmentAmount: 5000000 // 50,000 NGN in kobo
    };

    console.log("Initiating loan with payload:", payload);

    try {
        const response = await fetch(`${MYITURA_API_URL}/api/v1/sdk/loans/initiate`, {
            method: 'POST',
            headers: {
                'X-API-Public-Key': MYITURA_PUBLIC_KEY,
                'X-API-Secret-Key': MYITURA_SECRET_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const text = await response.text();
        console.log("Response status:", response.status);
        
        try {
            const data = JSON.parse(text);
            console.log("Response JSON:", JSON.stringify(data, null, 2));
            
            if (data.success && data.data && data.data.applicationUrl) {
                console.log("\n✅ SUCCESS: MyItura SDK returned an application URL.");
                console.log("SMS should have been sent to 07061188005");
                console.log("URL:", data.data.applicationUrl);
            } else {
                console.log("\n❌ FAILED to get application URL");
            }
        } catch (e) {
            console.log("Response Text:", text);
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

testSDK();
