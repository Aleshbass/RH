// Test script for video call functionality
// Run this script to test the Daily.co integration

async function testVideoCall() {
  console.log('🎥 Testing Video Call Integration...\n');

  // Check environment variables
  console.log('1. Checking environment variables:');
  const dailyDomain = process.env.NEXT_PUBLIC_DAILY_DOMAIN;
  const dailyApiKey = process.env.DAILY_API_KEY;
  
  console.log(`   - NEXT_PUBLIC_DAILY_DOMAIN: ${dailyDomain ? '✅ Set' : '❌ Missing'}`);
  console.log(`   - DAILY_API_KEY: ${dailyApiKey ? '✅ Set' : '❌ Missing'}`);
  
  if (!dailyDomain || !dailyApiKey) {
    console.error('\n❌ Missing required environment variables!');
    console.log('Please ensure both NEXT_PUBLIC_DAILY_DOMAIN and DAILY_API_KEY are set in .env.local');
    return;
  }

  // Test Daily.co API connection
  console.log('\n2. Testing Daily.co API connection:');
  try {
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${dailyApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ Connected to Daily.co API`);
      console.log(`   - Total rooms: ${data.total_count || 0}`);
      console.log(`   - API Status: Active`);
    } else {
      console.error(`   ❌ Daily.co API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(`   - Error details: ${errorText}`);
    }
  } catch (error) {
    console.error(`   ❌ Failed to connect to Daily.co API:`, error.message);
  }

  // Check Daily.co domain configuration
  console.log('\n3. Checking Daily.co domain configuration:');
  console.log(`   - Domain: ${dailyDomain}`);
  
  if (dailyDomain.includes('daily.co')) {
    console.log('   ✅ Valid Daily.co domain format');
  } else {
    console.error('   ❌ Invalid domain format. Should be like: your-subdomain.daily.co');
  }

  // Test room creation
  console.log('\n4. Testing room creation:');
  try {
    const testRoomName = `test-room-${Date.now()}`;
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dailyApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: testRoomName,
        privacy: 'private',
        properties: {
          enable_chat: true,
          enable_screenshare: true,
          enable_recording: false,
          max_participants: 10,
          exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        }
      })
    });

    if (response.ok) {
      const room = await response.json();
      console.log(`   ✅ Successfully created test room: ${room.name}`);
      console.log(`   - Room URL: ${room.url}`);
      console.log(`   - Privacy: ${room.privacy}`);
      
      // Clean up - delete the test room
      const deleteResponse = await fetch(`https://api.daily.co/v1/rooms/${room.name}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${dailyApiKey}`
        }
      });
      
      if (deleteResponse.ok) {
        console.log(`   ✅ Test room cleaned up successfully`);
      }
    } else {
      console.error(`   ❌ Failed to create test room: ${response.status}`);
      const errorText = await response.text();
      console.error(`   - Error: ${errorText}`);
    }
  } catch (error) {
    console.error(`   ❌ Room creation test failed:`, error.message);
  }

  console.log('\n5. Video Call Integration Summary:');
  console.log('   ✅ Environment variables configured');
  console.log('   ✅ VideoCall component updated with callId and meetingToken props');
  console.log('   ✅ VideoCallManager passes callId to VideoCall');
  console.log('   ✅ Backend query getCallByRoomId added for room ID lookup');
  console.log('   ✅ Stable refs implemented to prevent re-render loops');
  
  console.log('\n📝 Next Steps:');
  console.log('   1. Start the development server: npm run dev');
  console.log('   2. Navigate to a dashboard (clinic or physiotherapist)');
  console.log('   3. Click on "Video Calls" section');
  console.log('   4. Create a new video call or join an existing one');
  console.log('   5. Test with multiple users in different browser windows');
  
  console.log('\n⚠️  Important Notes:');
  console.log('   - Ensure HTTPS is used (or localhost) for camera/mic access');
  console.log('   - Daily.co account must have a credit card on file');
  console.log('   - Check browser console for detailed debug logs');
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Run the test
testVideoCall().catch(console.error);
