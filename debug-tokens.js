// Debug script to investigate token generation issues
// Run this with: node debug-tokens.js

// Using built-in fetch (Node.js 18+)

async function debugTokens() {
  console.log('🔍 Debugging Daily.co token generation...');
  
  const dailyApiKey = process.env.DAILY_API_KEY;
  if (!dailyApiKey) {
    console.error('❌ DAILY_API_KEY not found in environment');
    return;
  }
  
  console.log('✅ Daily.co API key found');
  
  // Test creating a meeting token for the existing room
  const roomName = '0O7j3LmD2DPMsKnRdgV6'; // From the logs
  
  try {
    console.log(`🎫 Attempting to create meeting token for room: ${roomName}`);
    
    const tokenResponse = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${dailyApiKey}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: "Test User",
          is_owner: true,
          exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60), // 2 hours from now
        },
      }),
    });
    
    console.log(`📡 Token API response status: ${tokenResponse.status}`);
    
    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json();
      console.log('✅ Token generated successfully:', {
        token: tokenData.token ? 'TOKEN_PRESENT' : 'TOKEN_MISSING',
        tokenLength: tokenData.token ? tokenData.token.length : 0
      });
    } else {
      const errorText = await tokenResponse.text();
      console.error('❌ Token generation failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText
      });
    }
    
  } catch (error) {
    console.error('❌ Error during token generation:', error.message);
  }
  
  // Test getting room info
  try {
    console.log(`🏠 Checking room info for: ${roomName}`);
    
    const roomResponse = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${dailyApiKey}`,
      },
    });
    
    console.log(`📡 Room API response status: ${roomResponse.status}`);
    
    if (roomResponse.ok) {
      const roomData = await roomResponse.json();
      console.log('✅ Room found:', {
        name: roomData.name,
        url: roomData.url,
        privacy: roomData.privacy,
        config: roomData.config ? 'CONFIG_PRESENT' : 'CONFIG_MISSING'
      });
    } else {
      const errorText = await roomResponse.text();
      console.error('❌ Room check failed:', {
        status: roomResponse.status,
        statusText: roomResponse.statusText,
        error: errorText
      });
    }
    
  } catch (error) {
    console.error('❌ Error during room check:', error.message);
  }
}

debugTokens().catch(console.error);
