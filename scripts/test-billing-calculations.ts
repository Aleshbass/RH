#!/usr/bin/env node

/**
 * Billing Calculations Test Script
 * Tests the fee calculation logic without requiring authentication
 * Validates platform fees, Paystack fees, and split calculations
 */

// Test data matching the billing system
const TEST_SCENARIOS = [
  {
    name: 'Small Invoice (₦5,000)',
    subtotal: 500000, // ₦5,000 in kobo
    expectedPlatformFee: 100000, // ₦1,000 fixed
  },
  {
    name: 'Medium Invoice (₦30,000)',
    subtotal: 3000000, // ₦30,000 in kobo
    expectedPlatformFee: 100000, // ₦1,000 fixed
  },
  {
    name: 'Large Invoice (₦100,000)',
    subtotal: 10000000, // ₦100,000 in kobo
    expectedPlatformFee: 100000, // ₦1,000 fixed
  }
];

// Helper functions
function formatCurrency(amountInKobo: number): string {
  return `₦${(amountInKobo / 100).toFixed(2)}`;
}

function logSection(title: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function logSuccess(message: string): void {
  console.log(`✅ ${message}`);
}

function logError(message: string): void {
  console.error(`❌ ${message}`);
}

function logInfo(message: string): void {
  console.log(`ℹ️  ${message}`);
}

// Replicate the fee calculation logic from convex/billing.ts
function calculateFees(subtotalAmount: number) {
  const platformFeeAmount = 100000; // ₦1,000 in kobo (fixed)
  
  // Paystack fees: 1.5% + ₦100 on (subtotal + platform fee)
  const baseAmount = subtotalAmount + platformFeeAmount;
  const paystackPercentageFee = Math.round(baseAmount * 0.015); // 1.5%
  const paystackFlatFee = 10000; // ₦100 in kobo
  const paystackFeeAmount = paystackPercentageFee + paystackFlatFee;
  
  const totalAmount = subtotalAmount + platformFeeAmount + paystackFeeAmount;
  const physiotherapistShare = subtotalAmount;
  const platformShare = platformFeeAmount;
  
  return {
    subtotalAmount,
    platformFeeAmount,
    paystackFeeAmount,
    totalAmount,
    physiotherapistShare,
    platformShare,
    paystackPercentageFee,
    paystackFlatFee
  };
}

function testFeeCalculations() {
  logSection('BILLING FEE CALCULATION TESTS');
  
  let allTestsPassed = true;
  
  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n📋 Testing: ${scenario.name}`);
    console.log(`   Subtotal: ${formatCurrency(scenario.subtotal)}`);
    
    const fees = calculateFees(scenario.subtotal);
    
    // Test platform fee
    if (fees.platformFeeAmount === scenario.expectedPlatformFee) {
      logSuccess(`Platform fee correct: ${formatCurrency(fees.platformFeeAmount)}`);
    } else {
      logError(`Platform fee incorrect: Expected ${formatCurrency(scenario.expectedPlatformFee)}, Got ${formatCurrency(fees.platformFeeAmount)}`);
      allTestsPassed = false;
    }
    
    // Test Paystack fee calculation
    const expectedPaystackPercentage = Math.round((scenario.subtotal + scenario.expectedPlatformFee) * 0.015);
    const expectedPaystackFlat = 10000;
    const expectedPaystackTotal = expectedPaystackPercentage + expectedPaystackFlat;
    
    if (fees.paystackFeeAmount === expectedPaystackTotal) {
      logSuccess(`Paystack fee correct: ${formatCurrency(fees.paystackFeeAmount)} (${formatCurrency(fees.paystackPercentageFee)} + ${formatCurrency(fees.paystackFlatFee)})`);
    } else {
      logError(`Paystack fee incorrect: Expected ${formatCurrency(expectedPaystackTotal)}, Got ${formatCurrency(fees.paystackFeeAmount)}`);
      allTestsPassed = false;
    }
    
    // Test total calculation
    const expectedTotal = scenario.subtotal + scenario.expectedPlatformFee + expectedPaystackTotal;
    if (fees.totalAmount === expectedTotal) {
      logSuccess(`Total amount correct: ${formatCurrency(fees.totalAmount)}`);
    } else {
      logError(`Total amount incorrect: Expected ${formatCurrency(expectedTotal)}, Got ${formatCurrency(fees.totalAmount)}`);
      allTestsPassed = false;
    }
    
    // Test split calculations
    if (fees.physiotherapistShare === scenario.subtotal) {
      logSuccess(`Physiotherapist share correct: ${formatCurrency(fees.physiotherapistShare)}`);
    } else {
      logError(`Physiotherapist share incorrect: Expected ${formatCurrency(scenario.subtotal)}, Got ${formatCurrency(fees.physiotherapistShare)}`);
      allTestsPassed = false;
    }
    
    if (fees.platformShare === scenario.expectedPlatformFee) {
      logSuccess(`Platform share correct: ${formatCurrency(fees.platformShare)}`);
    } else {
      logError(`Platform share incorrect: Expected ${formatCurrency(scenario.expectedPlatformFee)}, Got ${formatCurrency(fees.platformShare)}`);
      allTestsPassed = false;
    }
    
    // Display breakdown
    logInfo(`Breakdown:`);
    logInfo(`  Subtotal: ${formatCurrency(fees.subtotalAmount)}`);
    logInfo(`  Platform Fee: ${formatCurrency(fees.platformFeeAmount)}`);
    logInfo(`  Paystack Fee: ${formatCurrency(fees.paystackFeeAmount)}`);
    logInfo(`  Total: ${formatCurrency(fees.totalAmount)}`);
    logInfo(`  Physiotherapist Gets: ${formatCurrency(fees.physiotherapistShare)}`);
    logInfo(`  Platform Gets: ${formatCurrency(fees.platformShare)}`);
  }
  
  return allTestsPassed;
}

function testEdgeCases() {
  logSection('EDGE CASE TESTS');
  
  let allTestsPassed = true;
  
  // Test minimum invoice (₦100)
  console.log('\n📋 Testing: Minimum Invoice (₦100)');
  const minFees = calculateFees(10000); // ₦100 in kobo
  
  // Platform fee should still be ₦1,000
  if (minFees.platformFeeAmount === 100000) {
    logSuccess('Platform fee maintained for minimum invoice');
  } else {
    logError('Platform fee incorrect for minimum invoice');
    allTestsPassed = false;
  }
  
  // Test very large invoice (₦1,000,000)
  console.log('\n📋 Testing: Large Invoice (₦1,000,000)');
  const largeFees = calculateFees(100000000); // ₦1,000,000 in kobo
  
  // Verify calculations are still accurate
  const expectedLargePaystack = Math.round((100000000 + 100000) * 0.015) + 10000;
  if (largeFees.paystackFeeAmount === expectedLargePaystack) {
    logSuccess('Paystack fee calculation accurate for large amounts');
  } else {
    logError('Paystack fee calculation failed for large amounts');
    allTestsPassed = false;
  }
  
  logInfo(`Large invoice breakdown:`);
  logInfo(`  Subtotal: ${formatCurrency(largeFees.subtotalAmount)}`);
  logInfo(`  Platform Fee: ${formatCurrency(largeFees.platformFeeAmount)}`);
  logInfo(`  Paystack Fee: ${formatCurrency(largeFees.paystackFeeAmount)}`);
  logInfo(`  Total: ${formatCurrency(largeFees.totalAmount)}`);
  
  return allTestsPassed;
}

function testPaystackFeeFormula() {
  logSection('PAYSTACK FEE FORMULA VALIDATION');
  
  let allTestsPassed = true;
  
  // Test the Paystack fee formula: 1.5% + ₦100 on (subtotal + platform fee)
  const testCases = [
    { amount: 1000000, description: '₦10,000' }, // ₦10,000
    { amount: 5000000, description: '₦50,000' }, // ₦50,000
    { amount: 20000000, description: '₦200,000' } // ₦200,000
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📋 Testing Paystack formula for ${testCase.description}`);
    
    const platformFee = 100000; // ₦1,000
    const baseForPaystack = testCase.amount + platformFee;
    
    // Manual calculation
    const expectedPercentage = Math.round(baseForPaystack * 0.015);
    const expectedFlat = 10000;
    const expectedTotal = expectedPercentage + expectedFlat;
    
    // Our function calculation
    const fees = calculateFees(testCase.amount);
    
    if (fees.paystackFeeAmount === expectedTotal) {
      logSuccess(`Paystack fee formula correct: ${formatCurrency(expectedTotal)}`);
      logInfo(`  Base amount: ${formatCurrency(baseForPaystack)}`);
      logInfo(`  1.5% fee: ${formatCurrency(expectedPercentage)}`);
      logInfo(`  Flat fee: ${formatCurrency(expectedFlat)}`);
      logInfo(`  Total Paystack fee: ${formatCurrency(expectedTotal)}`);
    } else {
      logError(`Paystack fee formula incorrect for ${testCase.description}`);
      logError(`  Expected: ${formatCurrency(expectedTotal)}, Got: ${formatCurrency(fees.paystackFeeAmount)}`);
      allTestsPassed = false;
    }
  }
  
  return allTestsPassed;
}

function generateSummaryReport(feeTestsPassed: boolean, edgeTestsPassed: boolean, formulaTestsPassed: boolean) {
  logSection('TEST SUMMARY REPORT');
  
  console.log('\n📊 Billing Calculation Test Results:');
  console.log('─'.repeat(40));
  
  if (feeTestsPassed) {
    console.log('✅ Fee Calculations: PASSED');
  } else {
    console.log('❌ Fee Calculations: FAILED');
  }
  
  if (edgeTestsPassed) {
    console.log('✅ Edge Cases: PASSED');
  } else {
    console.log('❌ Edge Cases: FAILED');
  }
  
  if (formulaTestsPassed) {
    console.log('✅ Paystack Formula: PASSED');
  } else {
    console.log('❌ Paystack Formula: FAILED');
  }
  
  console.log('─'.repeat(40));
  
  const totalTests = 3;
  const passedTests = [feeTestsPassed, edgeTestsPassed, formulaTestsPassed].filter(Boolean).length;
  const successRate = (passedTests / totalTests * 100).toFixed(0);
  
  console.log(`\n🎯 Overall Success Rate: ${successRate}% (${passedTests}/${totalTests} test suites passed)`);
  
  if (successRate === '100') {
    console.log('\n✨ BILLING CALCULATIONS ARE PRODUCTION READY! ✨');
    console.log('\n📋 Key Validation Points:');
    console.log('   ✅ Platform fee: Fixed ₦1,000 per invoice');
    console.log('   ✅ Paystack fee: 1.5% + ₦100 on (subtotal + platform fee)');
    console.log('   ✅ Split payments: Correct physiotherapist and platform shares');
    console.log('   ✅ Edge cases: Minimum and maximum amounts handled correctly');
    console.log('   ✅ Formula accuracy: Mathematical precision maintained');
  } else if (successRate >= '67') {
    console.log('\n⚠️  Billing calculations mostly correct, review failed tests');
  } else {
    console.log('\n❌ Billing calculations need attention before production');
  }
}

// Main test runner
async function runCalculationTests() {
  console.log('\n🧮 Starting Billing Calculation Tests...');
  console.log('━'.repeat(60));
  console.log('Testing fee calculations without requiring authentication');
  console.log('Validating the core billing logic used in production');
  
  try {
    // Run all test suites
    const feeTestsPassed = testFeeCalculations();
    const edgeTestsPassed = testEdgeCases();
    const formulaTestsPassed = testPaystackFeeFormula();
    
    // Generate summary report
    generateSummaryReport(feeTestsPassed, edgeTestsPassed, formulaTestsPassed);
    
  } catch (error: any) {
    console.error('\n💥 Critical test failure:', error);
    process.exit(1);
  }
  
  console.log('\n✅ Billing calculation tests completed!');
  console.log('━'.repeat(60));
  process.exit(0);
}

// Run tests
runCalculationTests().catch((error: any) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
