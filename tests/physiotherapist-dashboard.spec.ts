import { test, expect } from '@playwright/test';

test.describe('Physiotherapist Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the login page and sign in as a physiotherapist
    await page.goto('/sign-in');
    await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
    await page.fill('input[type="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    
    // Wait for dashboard to load
    await page.waitForURL('/dashboard/physiotherapist');
  });

  test('should display all required dashboard widgets', async ({ page }) => {
    // Check main dashboard components
    await expect(page.getByText('Quick Actions')).toBeVisible();
    await expect(page.getByText('Recent Sessions')).toBeVisible();
    await expect(page.getByText("Today's Schedule")).toBeVisible();
    await expect(page.getByText('Recent Patients')).toBeVisible();
  });

  test('should allow patient invitation', async ({ page }) => {
    // Click invite patient button
    await page.click('button:has-text("Invite Patient")');
    
    // Fill in patient details
    await page.fill('input[name="patientEmail"]', 'new.patient@example.com');
    await page.fill('input[name="patientName"]', 'John Doe');
    await page.click('button:has-text("Send Invitation")');
    
    // Verify success message
    await expect(page.getByText('Invitation sent successfully')).toBeVisible();
  });

  test('should allow creating and managing appointments', async ({ page }) => {
    // Navigate to appointments page
    await page.click('a:has-text("Appointments")');
    await page.waitForURL('/dashboard/physiotherapist/appointments');
    
    // Create new appointment
    await page.click('button:has-text("New Appointment")');
    await page.fill('input[name="patientSearch"]', 'Test Patient');
    await page.click('.patient-option:first-child');
    await page.fill('input[name="date"]', '2024-12-31');
    await page.fill('input[name="time"]', '10:00');
    await page.click('button:has-text("Schedule")');
    
    // Verify appointment creation
    await expect(page.getByText('Appointment scheduled successfully')).toBeVisible();
  });

  test('should allow viewing and managing patients', async ({ page }) => {
    // Navigate to patients page
    await page.click('a:has-text("Patients")');
    await page.waitForURL('/dashboard/physiotherapist/patients');
    
    // Check patient list features
    await expect(page.getByText('Active Patients')).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    
    // Test patient search
    await page.fill('input[placeholder="Search patients..."]', 'Test');
    await expect(page.getByRole('table')).toContainText('Test Patient');
  });

  test('should allow creating and managing invoices', async ({ page }) => {
    // Navigate to billing page
    await page.click('a:has-text("Billing")');
    await page.waitForURL('/dashboard/physiotherapist/billing');
    
    // Create new invoice
    await page.click('button:has-text("Create Invoice")');
    await page.fill('select[name="patientId"]', 'Test Patient');
    await page.fill('input[name="items.0.description"]', 'Physiotherapy Session');
    await page.fill('input[name="items.0.quantity"]', '1');
    await page.fill('input[name="items.0.unitPrice"]', '15000');
    await page.click('button:has-text("Create Invoice")');
    
    // Verify invoice creation
    await expect(page.getByText('Invoice created successfully')).toBeVisible();
  });

  test('should allow video call management', async ({ page }) => {
    // Navigate to video calls page
    await page.click('a:has-text("Video Calls")');
    await page.waitForURL('/dashboard/physiotherapist/video-calls');
    
    // Schedule new video call
    await page.click('button:has-text("Schedule Call")');
    await page.fill('select[name="patientId"]', 'Test Patient');
    await page.fill('input[name="date"]', '2024-12-31');
    await page.fill('input[name="time"]', '11:00');
    await page.click('button:has-text("Schedule")');
    
    // Verify video call scheduling
    await expect(page.getByText('Video call scheduled successfully')).toBeVisible();
  });

  test('should allow session logging', async ({ page }) => {
    // Navigate to a patient's page
    await page.click('a:has-text("Patients")');
    await page.click('a:has-text("Test Patient")');
    
    // Create new session log
    await page.click('button:has-text("Log Session")');
    await page.fill('textarea[name="subjectiveAssessment"]', 'Patient reports improvement in mobility');
    await page.fill('textarea[name="objectiveAssessment"]', 'Increased range of motion observed');
    await page.fill('textarea[name="treatmentAdministered"]', 'Manual therapy and exercises');
    await page.fill('textarea[name="planForNextSession"]', 'Continue with current exercise plan');
    await page.click('button:has-text("Save Session")');
    
    // Verify session log creation
    await expect(page.getByText('Session logged successfully')).toBeVisible();
  });

  test('should display real-time notifications', async ({ page }) => {
    // Check notification bell
    await page.click('button[aria-label="Open notifications"]');
    await expect(page.getByRole('dialog')).toBeVisible();
    
    // Verify notifications list
    await expect(page.getByRole('list', { name: 'Notifications' })).toBeVisible();
  });
}); 