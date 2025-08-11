/**
 * Test file for Redis caching implementation
 * Run this to validate that Redis caching is working correctly
 */

import { CacheService, QueryCache, CACHE_TTL } from './caching'
import { SessionManager, UserSession } from './sessionManager'
import { redis, CACHE_PREFIXES } from './client'

// Test data
const testUserId = 'test-user-123' as any
const testData = {
  name: 'Test User',
  email: 'test@example.com',
  role: 'physiotherapist',
  appointments: [
    { id: 1, date: '2024-01-15', patient: 'John Doe' },
    { id: 2, date: '2024-01-16', patient: 'Jane Smith' }
  ]
}

/**
 * Test basic cache operations
 */
async function testBasicCaching() {
  console.log('\n🧪 Testing Basic Cache Operations...')
  
  try {
    // Test SET operation
    const setResult = await CacheService.set('test-key', testData, {
      ttl: CACHE_TTL.SHORT,
      prefix: CACHE_PREFIXES.USER
    })
    console.log('✅ Cache SET:', setResult)
    
    // Test GET operation
    const getData = await CacheService.get('test-key', {
      prefix: CACHE_PREFIXES.USER
    })
    console.log('✅ Cache GET:', getData ? 'Success' : 'Failed')
    console.log('   Data matches:', JSON.stringify(getData) === JSON.stringify(testData))
    
    // Test EXISTS operation
    const exists = await CacheService.exists('test-key', {
      prefix: CACHE_PREFIXES.USER
    })
    console.log('✅ Cache EXISTS:', exists)
    
    // Test DELETE operation
    const deleteResult = await CacheService.delete('test-key', {
      prefix: CACHE_PREFIXES.USER
    })
    console.log('✅ Cache DELETE:', deleteResult)
    
    // Verify deletion
    const deletedData = await CacheService.get('test-key', {
      prefix: CACHE_PREFIXES.USER
    })
    console.log('✅ Verify deletion:', deletedData === null)
    
  } catch (error) {
    console.error('❌ Basic caching test failed:', error)
  }
}

/**
 * Test query caching
 */
async function testQueryCaching() {
  console.log('\n🧪 Testing Query Cache Operations...')
  
  try {
    const queryName = 'getUserAppointments'
    const params = { userId: testUserId, limit: 10 }
    
    // Cache a query result
    const cacheResult = await QueryCache.cacheQuery(
      queryName,
      params,
      testData.appointments,
      CACHE_TTL.MEDIUM
    )
    console.log('✅ Query cache SET:', cacheResult)
    
    // Retrieve cached query
    const cachedQuery = await QueryCache.getCachedQuery(queryName, params)
    console.log('✅ Query cache GET:', cachedQuery ? 'Success' : 'Failed')
    console.log('   Data length:', (cachedQuery as any)?.length)
    
    // Test getOrSet pattern
    const getOrSetResult = await CacheService.getOrSet(
      'expensive-computation',
      async () => {
        console.log('   Executing expensive computation...')
        await new Promise(resolve => setTimeout(resolve, 100))
        return { result: 'computed-value', timestamp: Date.now() }
      },
      { ttl: CACHE_TTL.SHORT, prefix: CACHE_PREFIXES.QUERY }
    )
    console.log('✅ GetOrSet result:', getOrSetResult ? 'Success' : 'Failed')
    
    // Test cache invalidation
    const invalidateResult = await QueryCache.invalidateQuery(queryName, params)
    console.log('✅ Query invalidation:', invalidateResult)
    
  } catch (error) {
    console.error('❌ Query caching test failed:', error)
  }
}

/**
 * Test session management
 */
async function testSessionManagement() {
  console.log('\n🧪 Testing Session Management...')
  
  try {
    // Create session
    const createResult = await SessionManager.createSession(
      testUserId,
      'clerk-test-123',
      {
        role: 'physiotherapist',
        preferences: { theme: 'dark', language: 'en' }
      }
    )
    console.log('✅ Session creation:', createResult)
    
    // Get session
    const session = await SessionManager.getSession(testUserId)
    console.log('✅ Session retrieval:', session ? 'Success' : 'Failed')
    console.log('   Session role:', session?.role)
    console.log('   Session preferences:', session?.preferences)
    
    // Update preferences
    const updateResult = await SessionManager.updatePreferences(testUserId, {
      theme: 'light',
      timezone: 'UTC'
    })
    console.log('✅ Preferences update:', updateResult)
    
    // Update dashboard state
    const dashboardUpdate = await SessionManager.updateDashboardState(testUserId, {
      activeTab: 'appointments',
      sidebarCollapsed: true
    })
    console.log('✅ Dashboard state update:', dashboardUpdate)
    
    // Check session activity
    const isActive = await SessionManager.isSessionActive(testUserId)
    console.log('✅ Session active check:', isActive)
    
    // Record activity
    const activityResult = await SessionManager.recordActivity(
      testUserId,
      'lastAppointment' as keyof UserSession['recentActivity'],
      Date.now()
    )
    console.log('✅ Activity recording:', activityResult)
    
    // Extend session
    const extendResult = await SessionManager.extendSession(testUserId)
    console.log('✅ Session extension:', extendResult)
    
  } catch (error) {
    console.error('❌ Session management test failed:', error)
  }
}

/**
 * Test Redis connection
 */
async function testRedisConnection() {
  console.log('\n🧪 Testing Redis Connection...')
  
  try {
    // Test basic Redis operations
    await (redis as any).set('connection-test', 'success', { ex: 60 })
    const result = await (redis as any).get('connection-test')
    console.log('✅ Redis connection:', result === 'success' ? 'Success' : 'Failed')
    
    // Clean up
    await (redis as any).del('connection-test')
    
    // Test Redis info (if available)
    try {
      const info = await (redis as any).ping()
      console.log('✅ Redis ping:', info)
    } catch (pingError) {
      console.log('ℹ️  Redis ping not available (normal for Upstash REST API)')
    }
    
  } catch (error) {
    console.error('❌ Redis connection test failed:', error)
  }
}

/**
 * Performance test
 */
async function testPerformance() {
  console.log('\n🧪 Testing Cache Performance...')
  
  try {
    const iterations = 10
    const testKey = 'performance-test'
    const testValue = { data: 'test'.repeat(100), timestamp: Date.now() }
    
    // Test write performance
    const writeStart = Date.now()
    for (let i = 0; i < iterations; i++) {
      await CacheService.set(`${testKey}-${i}`, testValue, { ttl: CACHE_TTL.SHORT })
    }
    const writeTime = Date.now() - writeStart
    console.log(`✅ Write performance: ${iterations} operations in ${writeTime}ms (${(writeTime/iterations).toFixed(2)}ms avg)`)
    
    // Test read performance
    const readStart = Date.now()
    for (let i = 0; i < iterations; i++) {
      await CacheService.get(`${testKey}-${i}`)
    }
    const readTime = Date.now() - readStart
    console.log(`✅ Read performance: ${iterations} operations in ${readTime}ms (${(readTime/iterations).toFixed(2)}ms avg)`)
    
    // Clean up
    for (let i = 0; i < iterations; i++) {
      await CacheService.delete(`${testKey}-${i}`)
    }
    
  } catch (error) {
    console.error('❌ Performance test failed:', error)
  }
}

/**
 * Cleanup test data
 */
async function cleanup() {
  console.log('\n🧹 Cleaning up test data...')
  
  try {
    // Clean up session
    await SessionManager.destroySession(testUserId)
    
    // Clean up any remaining test keys
    await CacheService.clearByPrefix('test-')
    await CacheService.clearByPrefix(CACHE_PREFIXES.QUERY + 'expensive-computation')
    
    console.log('✅ Cleanup completed')
  } catch (error) {
    console.error('❌ Cleanup failed:', error)
  }
}

/**
 * Run all tests
 */
export async function runCacheTests() {
  console.log('🚀 Starting Redis Cache Tests...')
  console.log('Environment:', {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? '✅ Set' : '❌ Missing',
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? '✅ Set' : '❌ Missing'
  })
  
  await testRedisConnection()
  await testBasicCaching()
  await testQueryCaching()
  await testSessionManagement()
  await testPerformance()
  await cleanup()
  
  console.log('\n✅ All Redis cache tests completed!')
}

// Export individual test functions for selective testing
export {
  testBasicCaching,
  testQueryCaching,
  testSessionManagement,
  testRedisConnection,
  testPerformance,
  cleanup
}
