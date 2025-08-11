#!/usr/bin/env tsx

/**
 * Test runner for Redis caching implementation
 * Run with: npx tsx scripts/test-redis.ts
 */

import { runCacheTests } from '../lib/redis/test-cache'

async function main() {
  console.log('🔧 RehabifyHealth Redis Cache Test Suite')
  console.log('==========================================\n')
  
  try {
    await runCacheTests()
    console.log('\n🎉 All tests passed! Redis caching is working correctly.')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Tests failed:', error)
    process.exit(1)
  }
}

main().catch(console.error)
