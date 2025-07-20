const { ConvexHttpClient } = require("convex/browser");
require('dotenv').config({ path: '.env.local' });

// Get Convex URL from environment or command line
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL not found in environment");
  console.error("Make sure you have run 'npx convex dev' first");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

async function setupAdmin() {
  console.log("🚀 Setting up Rehabify Health Admin Dashboard");
  console.log(`📡 Using Convex deployment: ${CONVEX_URL}`);
  
  const adminUsers = [
    {
      clerkId: "user_2y2E8f8jAQ7elOnhRkpJCxgSkqc",
      email: "pauledet339@gmail.com",
      firstName: "Paul",
      lastName: "Edet"
    }
  ];

  try {
    console.log("🔧 Creating admin users...");
    
    for (const admin of adminUsers) {
      try {
        const result = await client.mutation("users:createAdminUser", admin);
        console.log(`✅ Admin user created/updated: ${admin.email}`);
        console.log(`   User ID: ${result}`);
        console.log(`   Clerk ID: ${admin.clerkId}`);
        console.log(`   Name: ${admin.firstName} ${admin.lastName}`);
      } catch (error) {
        console.error(`❌ Failed to create admin user ${admin.email}:`, error.message);
        
        // Try to update existing user to admin role
        try {
          console.log(`🔄 Attempting to promote existing user ${admin.email} to admin...`);
          const result = await client.mutation("users:setUserRole", {
            clerkId: admin.clerkId,
            role: "admin"
          });
          console.log(`✅ User ${admin.email} promoted to admin successfully!`);
        } catch (promoteError) {
          console.error(`❌ Failed to promote user ${admin.email}:`, promoteError.message);
        }
      }
    }

    console.log("\n🎯 Admin Dashboard Setup Complete!");
    console.log("📊 You can now access the admin dashboard at:");
    console.log("   Development: http://localhost:3001/admin");
    console.log("   Production: https://your-domain.com/admin");
    
    console.log("\n🔐 Admin Features Available:");
    console.log("   • Platform Analytics & Metrics");
    console.log("   • User Management & Approvals");
    console.log("   • System Health Monitoring");
    console.log("   • Notification Management");
    console.log("   • Audit Logs & Activity Tracking");

    // Test admin functions
    console.log("\n🧪 Testing admin functions...");
    try {
      const analytics = await client.query("admin:getPlatformAnalytics");
      console.log("✅ Platform analytics accessible");
    } catch (error) {
      console.log("⚠️  Platform analytics require user authentication");
    }

  } catch (error) {
    console.error("❌ Failed to setup admin:", error);
    process.exit(1);
  }
}

// Check environment health
async function checkEnvironmentHealth() {
  console.log("🔍 Checking environment health...");
  
  const requiredEnvVars = [
    'NEXT_PUBLIC_CONVEX_URL',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'CLERK_JWT_ISSUER_DOMAIN'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach(key => console.error(`   - ${key}`));
    console.error("\nPlease check your .env.local file");
    return false;
  }

  console.log("✅ All required environment variables present");
  return true;
}

async function main() {
  const healthOk = await checkEnvironmentHealth();
  if (!healthOk) {
    process.exit(1);
  }
  
  await setupAdmin();
}

main().catch(console.error); 