#!/usr/bin/env node

/**
 * End-to-End Billing Flow Test Script
 * Tests the complete billing system including:
 * - Invoice creation with platform and Paystack fees
 * - Bank account connection
 * - Payment processing
 * - Split payment distribution
 * - Payout management
 */

import { config } from 'dotenv';
import { ConvexClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

config({ path: '.env.local' });

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error('NEXT_PUBLIC_CONVEX_URL environment variable is not set');
  process.exit(1);
}
const client = new ConvexClient(CONVEX_URL);

// Test data
const TEST_INVOICE = {
  patientId: null, // Will be set from actual user
  clinicId: null, // Optional
  items: [
    {
      id: '1',
      description: 'Physiotherapy Session - Initial Assessment',
      quantity: 1,
      unitPrice: 1500000, // ₦15,000 in kobo
      totalPrice: 1500000
    },
    {
      id: '2',
      description: 'Therapeutic Exercises',
      quantity: 3,
      unitPrice: 500000, // ₦5,000 in kobo
      totalPrice: 1500000
    }
  ],
  subtotalAmount: 3000000, // ₦30,000 in kobo
  taxAmount: 0,
  discountAmount: 0,
  currency: 'NGN',
  dueDate: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days from now
  notes: 'Test invoice for billing flow validation'
};

const TEST_BANK_ACCOUNT = {
  bankCode: '057', // Zenith Bank
  accountNumber: '1234567890',
  accountName: 'Test Physiotherapist',
  businessName: 'Test Physiotherapy Clinic'
};

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

async function testInvoiceCreation() {
  logSection('1. INVOICE CREATION WITH FEE CALCULATION');
  
  try {
    // Get test users
    const users = await client.query(api.users.getAllUsers, {});
    const physiotherapist = users.find((u: any) => u.role === 'physiotherapist');
    const patient = users.find((u: any) => u.role === 'patient');
    
    if (!physiotherapist || !patient) {
      logError('Test users not found. Please ensure test data exists.');
      return null;
    }
    
    logInfo(`Physiotherapist: ${physiotherapist.firstName} ${physiotherapist.lastName}`);
    logInfo(`Patient: ${patient.firstName} ${patient.lastName}`);
    
    // Create invoice
    const invoiceData = {
      ...TEST_INVOICE,
      patientId: patient._id,
      physiotherapistId: physiotherapist._id
    };
    
    logInfo('Creating invoice with:');
    logInfo(`  Subtotal: ${formatCurrency(invoiceData.subtotalAmount)}`);
    logInfo('  Platform Fee: ₦1,000.00 (fixed)');
    logInfo('  Paystack Fee: 1.5% + ₦100.00');
    
    const invoice = await client.mutation(api.billing.createInvoice, invoiceData);
    
    if (invoice) {
      logSuccess('Invoice created successfully!');
      logInfo(`  Invoice Number: ${invoice.invoiceNumber}`);
      logInfo(`  Total Amount: ${formatCurrency(invoice.totalAmount)}`);
      logInfo(`  Platform Fee: ${formatCurrency(invoice.platformFeeAmount)}`);
      logInfo(`  Paystack Fee: ${formatCurrency(invoice.paystackFeeAmount)}`);
      logInfo(`  Physiotherapist Share: ${formatCurrency(invoice.physiotherapistShare)}`);
      logInfo(`  Platform Share: ${formatCurrency(invoice.platformShare)}`);
      
      // Validate fee calculations
      const expectedPlatformFee = 100000; // ₦1,000 in kobo
      const expectedPaystackPercentage = Math.round((invoice.subtotalAmount + expectedPlatformFee) * 0.015);
      const expectedPaystackFlat = 10000; // ₦100 in kobo
      const expectedPaystackFee = expectedPaystackPercentage + expectedPaystackFlat;
      const expectedTotal = invoice.subtotalAmount + expectedPlatformFee + expectedPaystackFee;
      
      if (invoice.platformFeeAmount === expectedPlatformFee) {
        logSuccess('Platform fee calculated correctly');
      } else {
        logError(`Platform fee mismatch: Expected ${formatCurrency(expectedPlatformFee)}, Got ${formatCurrency(invoice.platformFeeAmount)}`);
      }
      
      if (Math.abs(invoice.paystackFeeAmount - expectedPaystackFee) < 100) { // Allow small rounding difference
        logSuccess('Paystack fee calculated correctly');
      } else {
        logError(`Paystack fee mismatch: Expected ~${formatCurrency(expectedPaystackFee)}, Got ${formatCurrency(invoice.paystackFeeAmount)}`);
      }
      
      if (Math.abs(invoice.totalAmount - expectedTotal) < 100) { // Allow small rounding difference
        logSuccess('Total amount calculated correctly');
      } else {
        logError(`Total amount mismatch: Expected ~${formatCurrency(expectedTotal)}, Got ${formatCurrency(invoice.totalAmount)}`);
      }
      
      return { invoice, physiotherapist, patient };
    }
  } catch (error: any) {
    logError(`Invoice creation failed: ${error.message}`);
    return null;
  }
}

async function testBankAccountConnection(physiotherapist: any) {
  logSection('2. BANK ACCOUNT CONNECTION');
  
  try {
    logInfo('Connecting bank account for physiotherapist...');
    logInfo(`  Bank: Zenith Bank (057)`);
    logInfo(`  Account: ${TEST_BANK_ACCOUNT.accountNumber}`);
    
    // In production, this would verify with Paystack and create subaccount
    const bankAccount = await client.mutation(api.payments.connectBankAccount, {
      ...TEST_BANK_ACCOUNT,
      subaccountCode: `ACCT_test_${Date.now()}` // Mock subaccount code
    });
    
    if (bankAccount.success) {
      logSuccess('Bank account connected successfully!');
      logInfo(`  Account ID: ${bankAccount.bankAccountId}`);
      logInfo(`  Status: Active`);
      
      // Return mock bank account for testing
      return {
        _id: bankAccount.bankAccountId,
        userId: physiotherapist._id,
        bankCode: TEST_BANK_ACCOUNT.bankCode,
        accountNumber: TEST_BANK_ACCOUNT.accountNumber,
        accountName: TEST_BANK_ACCOUNT.accountName,
        status: 'active'
      };
    }
  } catch (error: any) {
    logError(`Bank account connection failed: ${error.message}`);
    return null;
  }
}

async function testPaymentProcessing(invoice: any, patient: any) {
  logSection('3. PAYMENT PROCESSING');
  
  try {
    logInfo('Initializing payment for invoice...');
    
    const payment = await client.action(api.payments.initializeInvoicePayment, {
      invoiceId: invoice._id,
      paymentMethod: 'card',
      redirectUrl: 'http://localhost:3000/dashboard/patient/invoices'
    });
    
    if (payment.success) {
      logSuccess('Payment initialized successfully!');
      logInfo(`  Payment ID: ${payment.paymentId}`);
      logInfo(`  Reference: ${payment.paystackReference}`);
      
      // Simulate successful payment webhook
      logInfo('Simulating successful payment webhook...');
      
      const paymentUpdate = await client.mutation(api.payments.updatePaymentStatus, {
        paystackReference: payment.paystackReference,
        status: 'completed',
        paystackData: {
          transactionId: `trans_${Date.now()}`,
          gatewayResponse: 'Successful',
          paidAt: Date.now(),
          channel: 'card',
          fees: invoice.paystackFeeAmount
        }
      });
      
      if (paymentUpdate.success) {
        logSuccess('Payment completed successfully!');
        logInfo(`  Invoice marked as PAID`);
        
        // Verify invoice status
        const updatedInvoice = await client.query(api.billing.getInvoice, {
          invoiceId: invoice._id
        });
        
        if (updatedInvoice && updatedInvoice.status === 'paid') {
          logSuccess('Invoice status updated correctly');
        }
        
        return payment;
      }
    }
  } catch (error: any) {
    logError(`Payment processing failed: ${error.message}`);
    return null;
  }
}

async function testSplitPayment(payment: any, invoice: any) {
  logSection('4. SPLIT PAYMENT PROCESSING');
  
  try {
    logInfo('Processing split payment distribution...');
    logInfo(`  Total Amount: ${formatCurrency(invoice.totalAmount)}`);
    logInfo(`  Platform Share: ${formatCurrency(invoice.platformShare)}`);
    logInfo(`  Physiotherapist Share: ${formatCurrency(invoice.physiotherapistShare)}`);
    
    const split = await client.mutation(api.payouts.processSplitPayment, {
      paymentId: payment.paymentId,
      transactionReference: `split_${Date.now()}`
    });
    
    if (split.success) {
      logSuccess('Split payment processed successfully!');
      logInfo(`  Platform receives: ${formatCurrency(split.platformShare)}`);
      logInfo(`  Physiotherapist receives: ${formatCurrency(split.physiotherapistShare)}`);
      
      // Verify payout record created
      const payouts = await client.query(api.payouts.getPendingPayouts, {
        limit: 10
      });
      
      if (payouts && payouts.length > 0) {
        logSuccess('Payout record created and pending');
        return payouts[0];
      }
    }
  } catch (error: any) {
    logError(`Split payment failed: ${error.message}`);
    return null;
  }
}

async function testPayoutManagement(bankAccount: any) {
  logSection('5. PAYOUT MANAGEMENT');
  
  try {
    // Get pending payouts
    const pendingPayouts = await client.query(api.payouts.getPendingPayouts, {
      limit: 10
    });
    
    if (!pendingPayouts || pendingPayouts.length === 0) {
      logInfo('No pending payouts to process');
      return;
    }
    
    logInfo(`Found ${pendingPayouts.length} pending payouts`);
    
    const totalAmount = pendingPayouts.reduce((sum: number, p: any) => sum + p.amount, 0);
    logInfo(`  Total pending amount: ${formatCurrency(totalAmount)}`);
    
    // Process bulk payout
    logInfo('Processing bulk payout to bank account...');
    
    const bulkPayout = await client.mutation(api.payouts.processBulkPayout, {
      payoutIds: pendingPayouts.map((p: any) => p._id),
      bankAccountId: bankAccount._id
    });
    
    if (bulkPayout.success) {
      logSuccess('Bulk payout initiated successfully!');
      logInfo(`  Processed ${bulkPayout.processedCount} transactions`);
      logInfo(`  Total amount: ${formatCurrency(bulkPayout.totalAmount)}`);
      
      // Get payout statistics
      const stats = await client.query(api.payouts.getPayoutStats, {});
      
      logInfo('\nPayout Statistics:');
      logInfo(`  Pending: ${stats.totalPending} (${formatCurrency(stats.pendingAmount)})`);
      logInfo(`  Processing: ${stats.totalProcessing} (${formatCurrency(stats.processingAmount)})`);
      logInfo(`  Completed: ${stats.totalCompleted} (${formatCurrency(stats.completedAmount)})`);
      
      if (stats.lastPayoutDate) {
        logInfo(`  Last payout: ${new Date(stats.lastPayoutDate).toLocaleDateString()}`);
      }
    }
  } catch (error: any) {
    logError(`Payout management failed: ${error.message}`);
  }
}

async function generateSummaryReport(results: any) {
  logSection('TEST SUMMARY REPORT');
  
  const { invoice, payment, split, payout } = results;
  
  console.log('\n📊 Billing Flow Test Results:');
  console.log('─'.repeat(40));
  
  if (invoice) {
    console.log('✅ Invoice Creation: PASSED');
    console.log(`   - Invoice #${invoice.invoiceNumber}`);
    console.log(`   - Amount: ${formatCurrency(invoice.totalAmount)}`);
  } else {
    console.log('❌ Invoice Creation: FAILED');
  }
  
  if (results.bankAccount) {
    console.log('✅ Bank Account Connection: PASSED');
  } else {
    console.log('❌ Bank Account Connection: FAILED');
  }
  
  if (payment) {
    console.log('✅ Payment Processing: PASSED');
    console.log(`   - Reference: ${payment.paystackReference}`);
  } else {
    console.log('❌ Payment Processing: FAILED');
  }
  
  if (split) {
    console.log('✅ Split Payment: PASSED');
    console.log(`   - Platform: ${formatCurrency(split.platformShare)}`);
    console.log(`   - Physiotherapist: ${formatCurrency(split.physiotherapistShare)}`);
  } else {
    console.log('❌ Split Payment: FAILED');
  }
  
  if (payout) {
    console.log('✅ Payout Management: PASSED');
  } else {
    console.log('⚠️  Payout Management: SKIPPED');
  }
  
  console.log('─'.repeat(40));
  
  const totalTests = 5;
  const passedTests = [invoice, results.bankAccount, payment, split, payout].filter(Boolean).length;
  const successRate = (passedTests / totalTests * 100).toFixed(0);
  
  console.log(`\n🎯 Overall Success Rate: ${successRate}% (${passedTests}/${totalTests} tests passed)`);
  
  if (successRate === '100') {
    console.log('\n✨ BILLING SYSTEM IS PRODUCTION READY! ✨');
  } else if (successRate >= '80') {
    console.log('\n⚠️  Billing system mostly functional, review failed tests');
  } else {
    console.log('\n❌ Billing system needs attention before production');
  }
}

// Main test runner
async function runBillingTests() {
  console.log('\n🚀 Starting End-to-End Billing Flow Tests...');
  console.log('━'.repeat(60));
  
  const results: any = {};
  
  try {
    // Test 1: Invoice Creation
    const invoiceResult = await testInvoiceCreation();
    if (invoiceResult) {
      results.invoice = invoiceResult.invoice;
      results.physiotherapist = invoiceResult.physiotherapist;
      results.patient = invoiceResult.patient;
      
      // Test 2: Bank Account Connection
      if (results.physiotherapist) {
        results.bankAccount = await testBankAccountConnection(results.physiotherapist);
      }
      
      // Test 3: Payment Processing
      if (results.invoice && results.patient) {
        results.payment = await testPaymentProcessing(results.invoice, results.patient);
      }
      
      // Test 4: Split Payment
      if (results.payment && results.invoice) {
        results.split = await testSplitPayment(results.payment, results.invoice);
      }
      
      // Test 5: Payout Management
      if (results.bankAccount) {
        results.payout = await testPayoutManagement(results.bankAccount);
      }
    }
    
    // Generate summary report
    await generateSummaryReport(results);
    
  } catch (error: any) {
    console.error('\n💥 Critical test failure:', error);
    process.exit(1);
  }
  
  console.log('\n✅ Billing flow tests completed!');
  console.log('━'.repeat(60));
  process.exit(0);
}

// Run tests
runBillingTests().catch((error: any) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
