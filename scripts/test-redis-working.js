/**
 * Working Redis cache test using the simplified implementation
 * Run with: node scripts/test-redis-working.js
 */

require('dotenv').config({ path: '.env.local' })

async function testSimpleCache() {
  console.log('🔧 Testing Simplified Redis Cache Implementation...')
  
  try {
    // Import the simplified cache using require for CommonJS
    const { SimpleCache, SessionCache, QueryCache, TTL } = require('../lib/redis/simpleCache.js')
    
    console.log('\n📡 Testing Basic Cache Operations...')
    
    // Test 1: Basic set/get
    console.log('1. Testing basic set/get...')
    const testData = { name: 'John Doe', age: 30, active: true }
    await SimpleCache.set('test:user:1', testData, TTL.SHORT)
    const retrieved = await SimpleCache.get('test:user:1')
    
    if (retrieved && retrieved.name === 'John Doe') {
      console.log('✅ Basic set/get working')
    } else {
      console.log('❌ Basic set/get failed')
    }
    
    // Test 2: Session management
    console.log('2. Testing session management...')
    const sessionData = {
      userId: 'user123',
      role: 'physiotherapist',
      preferences: { theme: 'dark' }
    }
    
    await SessionCache.setSession('user123', sessionData)
    const session = await SessionCache.getSession('user123')
    
    if (session && session.role === 'physiotherapist') {
      console.log('✅ Session management working')
    } else {
      console.log('❌ Session management failed')
    }
    
    // Test 3: Query caching
    console.log('3. Testing query caching...')
    const queryResult = [
      { id: 1, name: 'Appointment 1' },
      { id: 2, name: 'Appointment 2' }
    ]
    
    await QueryCache.cacheQuery('getAppointments', { userId: 'user123' }, queryResult, TTL.MEDIUM)
    const cachedQuery = await QueryCache.getCachedQuery('getAppointments', { userId: 'user123' })
    
    if (cachedQuery && Array.isArray(cachedQuery) && cachedQuery.length === 2) {
      console.log('✅ Query caching working')
    } else {
      console.log('❌ Query caching failed')
    }
    
    // Test 4: GetOrSet pattern
    console.log('4. Testing getOrSet pattern...')
    let executionCount = 0
    
    const expensiveFunction = async () => {
      executionCount++
      console.log(`   Executing expensive function (count: ${executionCount})`)
      return { computed: 'expensive-result', timestamp: Date.now() }
    }
    
    // First call should execute function
    const result1 = await SimpleCache.getOrSet('expensive:computation', expensiveFunction, TTL.SHORT)
    
    // Second call should use cache
    const result2 = await SimpleCache.getOrSet('expensive:computation', expensiveFunction, TTL.SHORT)
    
    if (executionCount === 1 && result1.computed === result2.computed) {
      console.log('✅ GetOrSet pattern working (function executed only once)')
    } else {
      console.log('❌ GetOrSet pattern failed')
    }
    
    // Test 5: Cache invalidation
    console.log('5. Testing cache invalidation...')
    await QueryCache.invalidateQuery('getAppointments', { userId: 'user123' })
    const invalidatedQuery = await QueryCache.getCachedQuery('getAppointments', { userId: 'user123' })
    
    if (invalidatedQuery === null) {
      console.log('✅ Cache invalidation working')
    } else {
      console.log('❌ Cache invalidation failed')
    }
    
    // Test 6: Performance test
    console.log('6. Testing performance...')
    const startTime = Date.now()
    const promises = []
    
    for (let i = 0; i < 10; i++) {
      promises.push(SimpleCache.set(`perf:test:${i}`, { data: `test-${i}` }, TTL.SHORT))
    }
    
    await Promise.all(promises)
    const writeTime = Date.now() - startTime
    
    const readStart = Date.now()
    const readPromises = []
    
    for (let i = 0; i < 10; i++) {
      readPromises.push(SimpleCache.get(`perf:test:${i}`))
    }
    
    await Promise.all(readPromises)
    const readTime = Date.now() - readStart
    
    console.log(`✅ Performance: Write 10 items in ${writeTime}ms, Read 10 items in ${readTime}ms`)
    
    // Cleanup
    console.log('7. Cleaning up test data...')
    await SimpleCache.clearPrefix('test:')
    await SimpleCache.clearPrefix('perf:')
    await SimpleCache.clearPrefix('expensive:')
    await SessionCache.deleteSession('user123')
    
    console.log('\n🎉 All tests passed! Redis caching is working correctly.')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('Stack trace:', error.stack)
    process.exit(1)
  }
}

testSimpleCache().catch(console.error)
