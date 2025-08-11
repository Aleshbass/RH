/**
 * Simple Redis connection test to debug issues
 * Run with: node scripts/test-redis-simple.js
 */

const { Redis } = require('@upstash/redis')
require('dotenv').config({ path: '.env.local' })

async function testRedisConnection() {
  console.log('🔧 Testing Redis Connection...')
  console.log('Environment variables:')
  console.log('UPSTASH_REDIS_REST_URL:', process.env.UPSTASH_REDIS_REST_URL ? '✅ Set' : '❌ Missing')
  console.log('UPSTASH_REDIS_REST_TOKEN:', process.env.UPSTASH_REDIS_REST_TOKEN ? '✅ Set' : '❌ Missing')
  
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('❌ Redis environment variables are missing!')
    process.exit(1)
  }

  try {
    // Initialize Redis client
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })

    console.log('\n📡 Testing basic Redis operations...')

    // Test 1: Set a value
    console.log('1. Setting test value...')
    await redis.set('test-key', 'hello-redis', { ex: 60 })
    console.log('✅ SET operation successful')

    // Test 2: Get the value
    console.log('2. Getting test value...')
    const value = await redis.get('test-key')
    console.log('✅ GET operation successful, value:', value)

    // Test 3: Check if value matches
    if (value === 'hello-redis') {
      console.log('✅ Value matches expected result')
    } else {
      console.log('❌ Value does not match expected result')
    }

    // Test 4: Delete the value
    console.log('3. Deleting test value...')
    await redis.del('test-key')
    console.log('✅ DELETE operation successful')

    // Test 5: Verify deletion
    console.log('4. Verifying deletion...')
    const deletedValue = await redis.get('test-key')
    if (deletedValue === null) {
      console.log('✅ Value successfully deleted')
    } else {
      console.log('❌ Value was not deleted properly')
    }

    // Test 6: Test with JSON data
    console.log('5. Testing JSON data...')
    const jsonData = { name: 'Test User', id: 123, active: true }
    await redis.set('test-json', JSON.stringify(jsonData), { ex: 60 })
    const retrievedJson = await redis.get('test-json')
    const parsedJson = JSON.parse(retrievedJson)
    
    if (parsedJson.name === 'Test User' && parsedJson.id === 123) {
      console.log('✅ JSON data test successful')
    } else {
      console.log('❌ JSON data test failed')
    }

    // Clean up
    await redis.del('test-json')

    console.log('\n🎉 All Redis tests passed! Connection is working correctly.')
    
  } catch (error) {
    console.error('\n❌ Redis test failed:', error.message)
    console.error('Full error:', error)
    process.exit(1)
  }
}

testRedisConnection().catch(console.error)
