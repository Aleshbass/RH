const { ConvexHttpClient } = require("convex/browser");

// Replace with your Convex deployment URL
const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
  console.error("❌ Please set CONVEX_URL or NEXT_PUBLIC_CONVEX_URL environment variable");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

async function setAdmin() {
  const clerkId = process.argv[2];
  const email = process.argv[3];
  const firstName = process.argv[4] || "Admin";
  const lastName = process.argv[5] || "User";

  if (!clerkId || !email) {
    console.log("Usage: node set-admin.js <clerk-user-id> <email> [firstName] [lastName]");
    console.log("Example: node set-admin.js user_abc123def email@example.com Admin User");
    return;
  }

  try {
    console.log("🔧 Setting admin user...");
    
    // Try to create admin user first
    const result = await client.mutation("users:createAdminUser", {
      clerkId,
      email,
      firstName,
      lastName,
    });

    console.log("✅ Admin user created successfully!");
    console.log(`User ID: ${result}`);
    console.log(`Clerk ID: ${clerkId}`);
    console.log(`Email: ${email}`);
    console.log(`Name: ${firstName} ${lastName}`);

  } catch (error) {
    console.error("❌ Failed to create admin user:", error.message);
    
    // If creation fails, try to promote existing user
    try {
      console.log("🔄 Attempting to promote existing user to admin...");
      
      const result = await client.mutation("users:setUserRole", {
        clerkId,
        role: "admin"
      });

      console.log("✅ User promoted to admin successfully!");
      console.log(`User ID: ${result}`);
      
    } catch (promoteError) {
      console.error("❌ Failed to promote user:", promoteError.message);
    }
  }
}

setAdmin().catch(console.error); 