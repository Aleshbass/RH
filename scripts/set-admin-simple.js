const { ConvexHttpClient } = require("convex/browser");

async function setAdmin() {
  const client = new ConvexHttpClient("https://kindly-elk-471.convex.cloud");
  
  try {
    // Update the user role directly
    const result = await client.mutation("users:createAdminUser", {
      clerkId: "user_2y2E8f8jAQ7elOnhRkpJCxgSkqc",
      email: "pauledet339@gmail.com", 
      firstName: "Paul",
      lastName: "Edet"
    });
    
    console.log("✅ Admin user created/updated:", result);
  } catch (error) {
    console.error("❌ Error setting admin:", error);
  }
}

setAdmin(); 