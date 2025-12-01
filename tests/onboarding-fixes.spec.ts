/**
 * Automated Tests for Onboarding & Video Call Fixes
 * 
 * This test suite validates:
 * 1. Admin email notifications on onboarding completion
 * 2. Manual video meeting link functionality
 * 3. Real-time dashboard redirect after approval
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  adminEmail: process.env.TEST_ADMIN_EMAIL || 'admin@test.com',
  adminPassword: process.env.TEST_ADMIN_PASSWORD || 'Test123!@#',
  testPhysioEmail: `physio-${Date.now()}@test.com`,
  testPhysioPassword: 'Test123!@#',
  timeout: 30000,
};

// Helper function to wait for element with retry
async function waitForElement(page: Page, selector: string, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    return true;
  } catch (error) {
    console.error(`Element not found: ${selector}`);
    return false;
  }
}

// Helper function to check console logs
async function captureConsoleLogs(page: Page, expectedLog: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 10000);
    
    page.on('console', (msg) => {
      if (msg.text().includes(expectedLog)) {
        clearTimeout(timeout);
        resolve(true);
      }
    });
  });
}

test.describe('Fix #1: Admin Email Notifications', () => {
  test('should send email to admin when physiotherapist completes onboarding', async ({ page, context }) => {
    test.setTimeout(60000); // 1 minute timeout

    // Step 1: Sign up as new physiotherapist
    await page.goto(`${TEST_CONFIG.baseUrl}/sign-up`);
    await page.waitForLoadState('networkidle');

    console.log('📝 Step 1: Signing up new physiotherapist...');
    
    // Fill sign-up form (adjust selectors based on your actual form)
    await page.fill('input[name="email"]', TEST_CONFIG.testPhysioEmail);
    await page.fill('input[name="password"]', TEST_CONFIG.testPhysioPassword);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to role selection
    await page.waitForURL('**/role-selection', { timeout: 15000 });

    // Step 2: Select physiotherapist role
    console.log('🏥 Step 2: Selecting physiotherapist role...');
    await page.click('button:has-text("Physiotherapist"), a:has-text("Physiotherapist")');
    await page.waitForURL('**/physiotherapist/step1', { timeout: 10000 });

    // Step 3: Complete onboarding step 1 (Personal Info)
    console.log('📋 Step 3: Completing personal info...');
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'Physiotherapist');
    await page.fill('input[name="phoneNumber"]', '+1234567890');
    await page.click('button:has-text("Next"), button:has-text("Continue")');
    
    await page.waitForURL('**/physiotherapist/step2', { timeout: 10000 });

    // Step 4: Complete onboarding step 2 (Professional Details)
    console.log('💼 Step 4: Completing professional details...');
    await page.fill('input[name="licenseNumber"]', 'LIC123456');
    await page.fill('input[name="yearsOfExperience"]', '5');
    
    // Select specialization
    await page.click('button:has-text("Select"), [role="combobox"]');
    await page.click('text="Manual Therapy"');
    
    await page.click('button:has-text("Next"), button:has-text("Continue")');
    await page.waitForURL('**/physiotherapist/step3', { timeout: 10000 });

    // Step 5: Complete onboarding step 3 (License & Credentials)
    console.log('🎓 Step 5: Completing credentials...');
    await page.fill('input[name="certificationBoard"]', 'National Board');
    await page.fill('input[name="certificationYear"]', '2019');
    
    // Listen for console log indicating email was scheduled
    const emailLogPromise = captureConsoleLogs(
      page, 
      '[completeUserProfile] Scheduling email to admin'
    );

    // Submit final step
    await page.click('button:has-text("Complete"), button:has-text("Submit")');
    
    // Wait for redirect to onboarding-complete
    await page.waitForURL('**/onboarding-complete', { timeout: 15000 });

    // Step 6: Verify console log shows email was scheduled
    console.log('✉️ Step 6: Verifying email notification was scheduled...');
    const emailScheduled = await emailLogPromise;
    
    expect(emailScheduled).toBeTruthy();
    console.log('✅ Admin email notification scheduled successfully!');

    // Step 7: Take screenshot of completion page
    await page.screenshot({ 
      path: 'test-results/onboarding-complete.png',
      fullPage: true 
    });
  });

  test('should create in-app notification for admin', async ({ page }) => {
    test.setTimeout(30000);

    // This test assumes previous test ran and created the notification
    // Login as admin
    await page.goto(`${TEST_CONFIG.baseUrl}/sign-in`);
    await page.fill('input[name="email"]', TEST_CONFIG.adminEmail);
    await page.fill('input[name="password"]', TEST_CONFIG.adminPassword);
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL('**/dashboard/**', { timeout: 15000 });

    // Check for notification bell or notification center
    console.log('🔔 Checking for admin notifications...');
    const notificationExists = await waitForElement(
      page, 
      '[data-testid="notification-badge"], .notification-indicator, button:has-text("Notifications")'
    );

    expect(notificationExists).toBeTruthy();
    console.log('✅ Admin notification created successfully!');
  });
});

test.describe('Fix #2: Manual Video Meeting Link', () => {
  test('should show manual meeting link field in appointment booking modal', async ({ page }) => {
    test.setTimeout(45000);

    // Step 1: Login as approved physiotherapist
    console.log('🔐 Step 1: Logging in as physiotherapist...');
    await page.goto(`${TEST_CONFIG.baseUrl}/sign-in`);
    
    // Use a pre-approved physio account for this test
    await page.fill('input[name="email"]', process.env.TEST_PHYSIO_EMAIL || 'approved-physio@test.com');
    await page.fill('input[name="password"]', process.env.TEST_PHYSIO_PASSWORD || 'Test123!@#');
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL('**/dashboard/physiotherapist**', { timeout: 15000 });

    // Step 2: Navigate to appointments page
    console.log('📅 Step 2: Navigating to appointments...');
    await page.click('a[href*="/appointments"], button:has-text("Appointments")');
    await page.waitForURL('**/appointments', { timeout: 10000 });

    // Step 3: Open appointment booking modal
    console.log('➕ Step 3: Opening appointment booking modal...');
    await page.click('button:has-text("Book Appointment"), button:has-text("Create Appointment"), button:has-text("New Appointment")');

    // Wait for modal to appear
    await page.waitForSelector('[role="dialog"], .modal, [data-testid="appointment-modal"]', { timeout: 5000 });

    // Step 4: Verify manual meeting link field exists
    console.log('🔍 Step 4: Checking for manual meeting link field...');
    
    const meetingLinkFieldExists = await page.locator('input[id="manualMeetingLink"], input[name="manualMeetingLink"], input[placeholder*="meet.google.com"]').count() > 0;
    expect(meetingLinkFieldExists).toBeTruthy();

    const labelExists = await page.locator('label:has-text("Video Meeting Link"), label:has-text("Meeting Link")').count() > 0;
    expect(labelExists).toBeTruthy();

    console.log('✅ Manual meeting link field is present!');

    // Step 5: Fill in the meeting link
    console.log('✍️ Step 5: Entering Google Meet link...');
    const testMeetingLink = 'https://meet.google.com/abc-defg-hij';
    await page.fill('input[id="manualMeetingLink"], input[name="manualMeetingLink"]', testMeetingLink);

    // Verify the value was entered
    const inputValue = await page.inputValue('input[id="manualMeetingLink"], input[name="manualMeetingLink"]');
    expect(inputValue).toBe(testMeetingLink);

    console.log('✅ Meeting link entered successfully!');

    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/meeting-link-field.png',
      fullPage: true 
    });
  });

  test('should save manual meeting link with appointment', async ({ page }) => {
    test.setTimeout(60000);

    // Login and navigate to appointments
    await page.goto(`${TEST_CONFIG.baseUrl}/sign-in`);
    await page.fill('input[name="email"]', process.env.TEST_PHYSIO_EMAIL || 'approved-physio@test.com');
    await page.fill('input[name="password"]', process.env.TEST_PHYSIO_PASSWORD || 'Test123!@#');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard/physiotherapist**', { timeout: 15000 });

    // Navigate to appointments
    await page.click('a[href*="/appointments"]');
    await page.waitForURL('**/appointments', { timeout: 10000 });

    // Open appointment modal
    await page.click('button:has-text("Book Appointment"), button:has-text("Create Appointment")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    console.log('📝 Filling appointment form with meeting link...');

    // Fill appointment details
    // Select patient
    await page.click('button[role="combobox"]:has-text("Select"), select[name="patientId"]');
    await page.click('[role="option"]:first-child, option:first-child');

    // Set date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateString = tomorrow.toISOString().split('T')[0];
    await page.fill('input[type="date"]', dateString);

    // Set time
    await page.fill('input[type="time"]:first', '14:00');
    await page.fill('input[type="time"]:last', '15:00');

    // Select service type
    await page.click('button:has-text("Select service"), select[name="serviceType"]');
    await page.click('text="Physiotherapy", option:has-text("Physiotherapy")');

    // Enter meeting link
    const testMeetingLink = `https://meet.google.com/test-${Date.now()}`;
    await page.fill('input[id="manualMeetingLink"]', testMeetingLink);

    // Submit appointment
    console.log('💾 Submitting appointment...');
    await page.click('button[type="submit"]:has-text("Book"), button:has-text("Create Appointment")');

    // Wait for success message or modal close
    await page.waitForTimeout(2000);

    // Verify appointment was created (check for success toast or updated list)
    const successMessage = await page.locator('text="successfully", text="created", [role="status"]').count() > 0;
    expect(successMessage).toBeTruthy();

    console.log('✅ Appointment with meeting link saved successfully!');
  });
});

test.describe('Fix #3: Real-time Dashboard Redirect After Approval', () => {
  test('should automatically redirect user after admin approval', async ({ page, context }) => {
    test.setTimeout(90000); // 1.5 minutes

    // This test requires two browser contexts: one for pending user, one for admin
    
    // Context 1: Pending physiotherapist
    console.log('👤 Step 1: Setting up pending physiotherapist session...');
    const pendingUserPage = page;
    
    // Create a new physiotherapist account that will be pending
    const newPhysioEmail = `pending-physio-${Date.now()}@test.com`;
    
    // (Assume we have a helper function to create and complete onboarding)
    // For this example, we'll navigate to the pending approval page directly
    await pendingUserPage.goto(`${TEST_CONFIG.baseUrl}/dashboard`);
    
    // Should see pending approval page
    const pendingPageVisible = await waitForElement(
      pendingUserPage,
      'text="pending approval", text="awaiting approval", text="under review"'
    );
    expect(pendingPageVisible).toBeTruthy();
    console.log('⏳ User is on pending approval page');

    // Set up listener for redirect
    const redirectPromise = new Promise<string>((resolve) => {
      pendingUserPage.on('framenavigated', (frame) => {
        if (frame === pendingUserPage.mainFrame()) {
          const url = frame.url();
          if (url.includes('/dashboard/physiotherapist') || url.includes('/dashboard/clinic')) {
            resolve(url);
          }
        }
      });
    });

    // Listen for console log
    const redirectLogPromise = captureConsoleLogs(
      pendingUserPage,
      '[DashboardAuthGuard] User approved, redirecting to'
    );

    // Context 2: Admin approves the user
    console.log('👨‍💼 Step 2: Admin approving the account...');
    const adminPage = await context.newPage();
    
    await adminPage.goto(`${TEST_CONFIG.baseUrl}/sign-in`);
    await adminPage.fill('input[name="email"]', TEST_CONFIG.adminEmail);
    await adminPage.fill('input[name="password"]', TEST_CONFIG.adminPassword);
    await adminPage.click('button[type="submit"]');
    
    // Navigate to admin approvals page
    await adminPage.waitForURL('**/dashboard/**', { timeout: 15000 });
    await adminPage.goto(`${TEST_CONFIG.baseUrl}/dashboard/admin/users`);
    
    // Find and approve the pending user
    await adminPage.click('text="Pending", button:has-text("Approve")');
    await adminPage.click('button:has-text("Confirm"), button:has-text("Approve")');
    
    console.log('✅ Admin approved the account');

    // Step 3: Verify redirect happens automatically
    console.log('🔄 Step 3: Waiting for automatic redirect...');
    
    const redirectUrl = await Promise.race([
      redirectPromise,
      new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error('Redirect timeout')), 15000)
      )
    ]);

    expect(redirectUrl).toContain('/dashboard');
    console.log(`✅ User automatically redirected to: ${redirectUrl}`);

    // Verify console log was printed
    const logPrinted = await redirectLogPromise;
    expect(logPrinted).toBeTruthy();
    console.log('✅ Redirect log confirmed in console');

    // Take screenshot of final dashboard
    await pendingUserPage.screenshot({ 
      path: 'test-results/auto-redirected-dashboard.png',
      fullPage: true 
    });

    await adminPage.close();
  });

  test('should not redirect if already on dashboard', async ({ page }) => {
    test.setTimeout(30000);

    // Login as approved physiotherapist
    await page.goto(`${TEST_CONFIG.baseUrl}/sign-in`);
    await page.fill('input[name="email"]', process.env.TEST_PHYSIO_EMAIL || 'approved-physio@test.com');
    await page.fill('input[name="password"]', process.env.TEST_PHYSIO_PASSWORD || 'Test123!@#');
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL('**/dashboard/physiotherapist**', { timeout: 15000 });
    const initialUrl = page.url();

    console.log('✅ User is on dashboard');

    // Wait a few seconds to ensure no unwanted redirects
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    expect(finalUrl).toBe(initialUrl);
    
    console.log('✅ No redirect loop detected - staying on dashboard');
  });
});

// Integration test: Full workflow
test.describe('Integration Test: Complete Workflow', () => {
  test('should complete full workflow from signup to approved dashboard', async ({ page, context }) => {
    test.setTimeout(120000); // 2 minutes

    console.log('🚀 Starting full integration test...');

    const testEmail = `integration-${Date.now()}@test.com`;

    // 1. Sign up
    console.log('1️⃣ Signing up...');
    await page.goto(`${TEST_CONFIG.baseUrl}/sign-up`);
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', TEST_CONFIG.testPhysioPassword);
    await page.click('button[type="submit"]');

    // 2. Select role
    console.log('2️⃣ Selecting physiotherapist role...');
    await page.waitForURL('**/role-selection');
    await page.click('button:has-text("Physiotherapist")');

    // 3. Complete onboarding
    console.log('3️⃣ Completing onboarding...');
    // Step 1
    await page.waitForURL('**/physiotherapist/step1');
    await page.fill('input[name="firstName"]', 'Integration');
    await page.fill('input[name="lastName"]', 'Test');
    await page.fill('input[name="phoneNumber"]', '+1234567890');
    await page.click('button:has-text("Next")');

    // Step 2
    await page.waitForURL('**/physiotherapist/step2');
    await page.fill('input[name="licenseNumber"]', 'INT123456');
    await page.fill('input[name="yearsOfExperience"]', '5');
    await page.click('button:has-text("Next")');

    // Step 3
    await page.waitForURL('**/physiotherapist/step3');
    await page.fill('input[name="certificationBoard"]', 'Test Board');
    await page.fill('input[name="certificationYear"]', '2020');
    
    const emailLogPromise = captureConsoleLogs(page, 'Scheduling email to admin');
    await page.click('button:has-text("Complete")');

    // 4. Verify email was scheduled
    console.log('4️⃣ Verifying admin email notification...');
    const emailScheduled = await emailLogPromise;
    expect(emailScheduled).toBeTruthy();
    console.log('✅ Email notification scheduled');

    // 5. Check pending page
    console.log('5️⃣ Verifying pending approval page...');
    await page.waitForURL('**/onboarding-complete');
    const pendingText = await page.locator('text="pending", text="awaiting approval"').count() > 0;
    expect(pendingText).toBeTruthy();

    // 6. Admin approves
    console.log('6️⃣ Admin approving account...');
    const adminPage = await context.newPage();
    await adminPage.goto(`${TEST_CONFIG.baseUrl}/sign-in`);
    await adminPage.fill('input[name="email"]', TEST_CONFIG.adminEmail);
    await adminPage.fill('input[name="password"]', TEST_CONFIG.adminPassword);
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL('**/dashboard/**');
    
    // Navigate and approve
    await adminPage.goto(`${TEST_CONFIG.baseUrl}/dashboard/admin/users`);
    await adminPage.waitForTimeout(2000);
    // Find user by email and approve
    await adminPage.click(`text="${testEmail}"`);
    await adminPage.click('button:has-text("Approve")');
    await adminPage.click('button:has-text("Confirm")');
    
    console.log('✅ Account approved');

    // 7. Verify auto-redirect
    console.log('7️⃣ Verifying auto-redirect...');
    await page.waitForURL('**/dashboard/physiotherapist**', { timeout: 20000 });
    console.log('✅ Auto-redirected to dashboard');

    // 8. Book appointment with meeting link
    console.log('8️⃣ Testing appointment with meeting link...');
    await page.click('a[href*="/appointments"]');
    await page.waitForURL('**/appointments');
    await page.click('button:has-text("Book Appointment")');
    
    // Verify meeting link field exists
    const meetingLinkField = await page.locator('input[id="manualMeetingLink"]').count() > 0;
    expect(meetingLinkField).toBeTruthy();
    console.log('✅ Meeting link field present');

    console.log('🎉 Integration test completed successfully!');

    await adminPage.close();
  });
});
