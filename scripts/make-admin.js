/**
 * Script to make a user an admin
 * Usage: node scripts/make-admin.js
 */

const { ConvexHttpClient } = require("convex/browser");

// Production Convex deployment URL
const CONVEX_URL = "https://adept-horse-443.convex.cloud";

// User ID to make admin
const USER_ID = "nd7ffbzyzmgy2nqzmxccvnnsfs7sxdv2";

async function makeAdmin() {
  console.log("🔧 Making user admin...");
  console.log("Convex URL:", CONVEX_URL);
  console.log("User ID:", USER_ID);
  console.log("");

  try {
    const client = new ConvexHttpClient(CONVEX_URL);

    // Call the internal mutation
    const result = await client.mutation("internal.users.bootstrapAdmin", {
      userId: USER_ID,
    });

    console.log("✅ Success! User is now an admin.");
    console.log("Result:", result);
    console.log("");
    console.log("User details:");
    console.log("- Email: pauledet339@gmail.com");
    console.log("- Name: Paul Edet");
    console.log("- Role: admin");
    console.log("- Onboarded: true");
  } catch (error) {
    console.error("❌ Error making user admin:", error.message);
    console.error("");
    console.error("Note: Internal mutations can only be called from:");
    console.error("1. Other Convex functions (actions, mutations)");
    console.error("2. Convex CLI with proper authentication");
    console.error("");
    console.error("Please use the Convex dashboard instead:");
    console.error("1. Go to: https://dashboard.convex.dev");
    console.error("2. Select deployment: prod:adept-horse-443");
    console.error("3. Go to Data > users table");
    console.error("4. Find user: pauledet339@gmail.com");
    console.error("5. Edit the document and set:");
    console.error("   - role: \"admin\"");
    console.error("   - onboarded: true");
  }
}

makeAdmin();
