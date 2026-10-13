const { ConvexHttpClient } = require("convex/browser");
require('dotenv').config({ path: '.env.local' });

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL not found in environment");
  process.exit(1);
}

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

async function debugPhysiotherapistClinics() {
  try {
    console.log("🔍 Debugging physiotherapist clinic assignments...");

    // Get all physiotherapists
    const physiotherapists = await client.query("users:getAllUsers", {});
    const physios = physiotherapists.filter(user => user.role === 'physiotherapist');
    
    console.log(`Found ${physios.length} physiotherapists`);

    for (const physio of physios) {
      console.log(`\n👨‍⚕️ Physiotherapist: ${physio.firstName} ${physio.lastName} (${physio.email})`);
      
             // Check physiotherapist profile
       const profile = await client.query("marketplace/search:getPhysiotherapistProfile", {
         physiotherapistId: physio._id
       });
      
      if (!profile) {
        console.log("❌ No physiotherapist profile found");
        continue;
      }

      console.log(`Clinic ID: ${profile.clinicId || 'MISSING'}`);
      
      if (!profile.clinicId) {
        console.log("❌ Missing clinic assignment!");
        
        // Try to find a clinic to assign
        const clinics = await client.query("clinics", "getAllClinics", {});
        if (clinics.length > 0) {
          const clinic = clinics[0]; // Assign to first available clinic
          console.log(`🔧 Attempting to assign to clinic: ${clinic.name}`);
          
          try {
            await client.mutation("physiotherapists", "updatePhysiotherapistProfile", {
              userId: physio._id,
              updates: {
                clinicId: clinic._id
              }
            });
            console.log(`✅ Successfully assigned to clinic ${clinic.name}`);
          } catch (error) {
            console.log(`❌ Failed to assign clinic: ${error.message}`);
          }
        } else {
          console.log("❌ No clinics available to assign");
        }
      } else {
        // Verify clinic exists
        try {
          const clinic = await client.query("clinics", "getClinic", {
            clinicId: profile.clinicId
          });
          console.log(`✅ Assigned to clinic: ${clinic?.name || 'Unknown'}`);
        } catch (error) {
          console.log(`❌ Clinic reference is invalid: ${error.message}`);
        }
      }
    }

    console.log("\n✅ Clinic assignment check complete");
  } catch (error) {
    console.error("❌ Error debugging physiotherapist clinics:", error);
  }
}

// Run the debug function
debugPhysiotherapistClinics(); 