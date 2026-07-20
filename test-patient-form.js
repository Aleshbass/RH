async function testPatientForm() {
    const payload = {
        firstName: "Paul",
        lastName: "Francis",
        phone: "07061188005",
        email: "paul.francis@example.com",
        treatment: "Physiotherapy Rehabilitation",
        treatmentAmount: 50000 // 50,000 NGN
    };

    console.log("Submitting loan request to local API:", payload);

    try {
        const response = await fetch("http://localhost:3000/api/myitura/loan-request", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const text = await response.text();
        console.log("Response status:", response.status);
        
        try {
            const data = JSON.parse(text);
            console.log("Response JSON:", JSON.stringify(data, null, 2));
            
            if (data.success && data.requestId) {
                console.log("\n✅ SUCCESS: Loan request submitted to Convex.");
                console.log("Request ID:", data.requestId);
            } else {
                console.log("\n❌ FAILED");
            }
        } catch (e) {
            console.log("Response Text:", text);
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

testPatientForm();
