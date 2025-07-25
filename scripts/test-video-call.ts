#!/usr/bin/env tsx

/**
 * Test script to verify video call functionality
 * Run with: npx tsx scripts/test-video-call.ts
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' })

import { checkVideoCallProductionReadiness, formatReadinessReport } from '../lib/video/productionReadinessCheck'

async function main() {
  console.log('🔍 Running Video Call Production Readiness Check...\n')
  
  try {
    const report = await checkVideoCallProductionReadiness()
    console.log(formatReadinessReport(report))
    
    // Exit with appropriate code
    if (report.overall === 'not_ready') {
      process.exit(1)
    } else if (report.overall === 'warnings') {
      process.exit(2)
    } else {
      process.exit(0)
    }
  } catch (error) {
    console.error('❌ Error running readiness check:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}
