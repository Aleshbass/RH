#!/usr/bin/env node

/**
 * Test script for patient invitation email functionality
 * This script tests the complete flow of sending patient invitations with email notifications
 */

const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const TEST_PHYSIOTHERAPIST_EMAIL = 'physiotherapist@test.com'; // Replace with your test physiotherapist email
const TEST_PATIENT_EMAIL = process.argv[2] || 'patient@test.com'; // First arg: recipient email
const BASE_URL = process.argv[3] || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'; // Second arg: optional base URL override
const TEST_PATIENT_NAME = 'Test Patient';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`\n${colors.bright}${colors.blue}[Step ${step}]${colors.reset} ${message}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

async function testEmailInvitation() {
  log('\n=================================', 'bright');
  log('Patient Invitation Email Test', 'bright');
  log('=================================', 'bright');
  
  logInfo(`Testing with patient email: ${TEST_PATIENT_EMAIL}`);
  logInfo(`Using base URL: ${BASE_URL}`);
  
  if (!CONVEX_URL) {
    logError('NEXT_PUBLIC_CONVEX_URL not found in environment variables');
    process.exit(1);
  }

  const client = new ConvexHttpClient(CONVEX_URL);
  
  try {
    // Step 1: Check environment variables
    logStep(1, 'Checking environment configuration');
    
    const envVars = {
      CONVEX_URL: !!process.env.NEXT_PUBLIC_CONVEX_URL,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      FROM_EMAIL: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      FROM_NAME: process.env.FROM_NAME || 'Rehabify Health',
      APP_URL: BASE_URL
    };
    
    Object.entries(envVars).forEach(([key, value]) => {
      if (key === 'RESEND_API_KEY') {
        if (value) {
          logSuccess(`${key} is configured`);
        } else {
          logWarning(`${key} is NOT configured - emails will not be sent`);
        }
      } else {
        logInfo(`${key}: ${value}`);
      }
    });

    // Step 2: Test direct email sending (if you have a test endpoint)
    logStep(2, 'Testing email service directly');
    
    try {
      // First, let's check if the email action exists and is callable
      const testEmailResult = await client.action(api.actions.emails.sendInvitationEmail.sendPatientInvitationEmail, {
        patientEmail: TEST_PATIENT_EMAIL,
        patientName: TEST_PATIENT_NAME,
        physiotherapistName: 'Test Physiotherapist',
        invitationCode: 'TEST-CODE-123',
        invitationLink: `${envVars.APP_URL}/patient-invite/TEST-CODE-123`,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days from now
      });
      
      if (testEmailResult.success) {
        logSuccess(`Email sent successfully! Message ID: ${testEmailResult.messageId}`);
      } else {
        logError(`Email failed: ${testEmailResult.error}`);
        logInfo('This might be due to missing RESEND_API_KEY in Convex environment');
      }
    } catch (error) {
      logError(`Direct email test failed: ${error.message}`);
      logInfo('Make sure RESEND_API_KEY is set in Convex dashboard environment variables');
    }

    // Step 3: Test the complete invitation flow
    logStep(3, 'Testing complete invitation flow with notification');
    
    try {
      // Get or create a test physiotherapist user
      // Note: This requires authentication - in production, you'd need proper auth tokens
      logInfo('Creating patient invitation through the action...');
      
      const invitationResult = await client.action(
        api.actions.patients.invitePatient.createPatientInvitationWithNotification,
        {
          patientEmail: TEST_PATIENT_EMAIL,
          patientName: TEST_PATIENT_NAME,
          notes: 'Test invitation from script',
          sendEmail: true,
          expirationDays: 7
        }
      );
      
      if (invitationResult.success) {
        logSuccess(`Invitation created successfully!`);
        logInfo(`Invitation code: ${invitationResult.invitationCode}`);
        logInfo(`Invitation link: ${envVars.APP_URL}/patient-invite/${invitationResult.invitationCode}`);
        
        if (invitationResult.message) {
          logInfo(`Message: ${invitationResult.message}`);
        }
      } else {
        logError(`Invitation failed: ${invitationResult.message}`);
      }
    } catch (error) {
      logError(`Invitation flow failed: ${error.message}`);
      logInfo('This might be due to authentication requirements');
      logInfo('Try running this test while logged in as a physiotherapist');
    }

    // Step 4: Check Convex logs for email sending
    logStep(4, 'Checking email logs');
    logInfo('Check your Convex dashboard logs for:');
    logInfo('1. [EMAIL SERVICE] log entries');
    logInfo('2. Any error messages related to Resend');
    logInfo('3. Confirmation of email being sent');
    
    // Step 5: Verify Resend configuration
    logStep(5, 'Verifying Resend configuration');
    logInfo('Make sure you have:');
    logInfo('1. Created a Resend account at https://resend.com');
    logInfo('2. Generated an API key');
    logInfo('3. Added RESEND_API_KEY to Convex environment variables');
    logInfo('4. Verified your sending domain (or using onboarding@resend.dev for testing)');
    
    // Step 6: Check email delivery
    logStep(6, 'Checking email delivery');
    logInfo(`Check the inbox for: ${TEST_PATIENT_EMAIL}`);
    logInfo('Also check spam/junk folder');
    logInfo('If using a test email service, check their dashboard');
    
    log('\n=================================', 'bright');
    log('Test Complete', 'bright');
    log('=================================', 'bright');
    
    // Summary
    console.log('\n' + colors.bright + 'Summary:' + colors.reset);
    logInfo('If emails are not being received, check:');
    console.log('  1. RESEND_API_KEY is set in Convex dashboard (Settings > Environment Variables)');
    console.log('  2. The API key is valid and has not expired');
    console.log('  3. Your Resend account is active and not suspended');
    console.log('  4. The recipient email is valid and not blocking emails');
    console.log('  5. Check Resend dashboard for email logs: https://resend.com/emails');
    
  } catch (error) {
    logError(`Test failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testEmailInvitation().catch(console.error);
