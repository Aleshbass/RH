import { ConvexClient } from 'convex/browser';
import { setupTestData } from './test-data';
import dotenv from 'dotenv';
import path from 'path';
import { chromium } from '@playwright/test';
import fs from 'fs';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function globalSetup() {
  // Get Convex URL from environment - prioritize NEXT_PUBLIC_CONVEX_URL
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
  
  console.log('🔧 Setting up test environment...');
  console.log('📍 Convex URL:', convexUrl ? convexUrl.substring(0, 30) + '...' : 'Not found');
  
  if (!convexUrl) {
    console.log('⚠️ No Convex URL found in environment variables.');
    console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('CONVEX')));
    return;
  }

  // Create Convex client
  const client = new ConvexClient(convexUrl);

  try {
    console.log('🔄 Connecting to Convex...');
    
    // Set up test data
    console.log('📝 Setting up test data...');
    const testData = await setupTestData(client);
    
    // Store test data IDs in environment variables for tests
    process.env.TEST_PHYSIOTHERAPIST_ID = testData.physiotherapistId;
    process.env.TEST_CLINIC_ID = testData.clinicId;
    process.env.TEST_PATIENT_ID = testData.patientId;
    process.env.TEST_APPOINTMENT_ID = testData.appointmentId;

    console.log('✅ Test data setup complete');
    console.log('🏥 Test Clinic ID:', testData.clinicId);
    console.log('👨‍⚕️ Test Physiotherapist ID:', testData.physiotherapistId);
    console.log('🏥 Test Patient ID:', testData.patientId);
    
    // -------------------------------
    // Capture authenticated storage state for tests to reuse
    // -------------------------------
    console.log('🔐 Generating authenticated storage state...');

    // Ensure directory exists
    const authDir = path.resolve(__dirname, '../.auth');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/sign-in`);

    // Fill Clerk sign-in form – adjust selectors if necessary
    await page.fill('input[placeholder="Email address"]', 'test.physiotherapist@rehabify.health');
    await page.fill('input[placeholder="Password"]', 'testpassword123');

    await Promise.all([
      page.waitForURL('**/dashboard/physiotherapist'),
      page.click('button:has-text("Continue")'),
    ]);

    await page.context().storageState({ path: path.join(authDir, 'physio.json') });

    await browser.close();

    console.log('✅ Auth storage saved to tests/.auth/physio.json');

  } catch (error) {
    console.error('❌ Failed to set up test data:', error);
    
    // Don't throw error in test setup - just log and continue
    // This allows tests to run even if test data setup fails
    console.log('⚠️ Continuing without test data setup...');
  } finally {
    // Clean up Convex client
    client.close();
  }
}

export default globalSetup; 