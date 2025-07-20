import { test, expect } from '@playwright/test';
import { Page } from '@playwright/test';

test.describe('Appointment Management', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    
    // Sign in as physiotherapist
    await page.goto('/sign-in');
    await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
    await page.fill('input[type="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    
    // Wait for dashboard to load
    await page.waitForURL('/dashboard/physiotherapist');
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('Appointment Creation', () => {
    test('should create a new appointment', async () => {
      // Navigate to appointments page
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      await page.waitForURL('/dashboard/physiotherapist/appointments');

      // Click create appointment button
      await page.click('button:has-text("Schedule Appointment")');

      // Fill appointment form
      await page.selectOption('select[name="patientId"]', { label: 'Test Patient' });
      await page.fill('input[name="title"]', 'Follow-up Session');
      await page.fill('input[type="date"]', '2024-12-31');
      await page.fill('input[type="time"]', '10:00');
      await page.selectOption('select[name="duration"]', '60');
      await page.selectOption('select[name="serviceType"]', 'Follow-up Consultation');
      await page.fill('textarea[name="notes"]', 'Regular follow-up session');

      // Submit form
      await page.click('button[type="submit"]');

      // Verify success message
      await expect(page.getByText('Appointment created successfully')).toBeVisible();
    });

    test('should validate required fields', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      await page.click('button:has-text("Schedule Appointment")');

      // Try to submit without filling required fields
      await page.click('button[type="submit"]');

      // Check for validation errors
      await expect(page.getByText('Please select a patient')).toBeVisible();
      await expect(page.getByText('Please enter appointment title')).toBeVisible();
    });

    test('should prevent double booking', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      await page.click('button:has-text("Schedule Appointment")');

      // Try to book at the same time as existing appointment
      await page.selectOption('select[name="patientId"]', { label: 'Test Patient' });
      await page.fill('input[name="title"]', 'Conflicting Appointment');
      await page.fill('input[type="date"]', '2024-12-30'); // Date with existing appointment
      await page.fill('input[type="time"]', '10:00'); // Same time as existing

      await page.click('button[type="submit"]');

      // Should show conflict error
      await expect(page.getByText('Time slot conflict detected')).toBeVisible();
    });
  });

  test.describe('Appointment Viewing', () => {
    test('should display appointments in calendar view', async () => {
      await page.click('a[href="/dashboard/physiotherapist/calendar"]');
      await page.waitForURL('/dashboard/physiotherapist/calendar');

      // Check calendar is loaded
      await expect(page.locator('.rbc-calendar')).toBeVisible();
      
      // Check for existing appointment
      await expect(page.getByText('Test Patient')).toBeVisible();
    });

    test('should display appointments in list view', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      
      // Check appointments table
      await expect(page.locator('table')).toBeVisible();
      await expect(page.getByText('Test Patient')).toBeVisible();
      await expect(page.getByText('Initial Consultation')).toBeVisible();
    });

    test('should filter appointments by status', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      
      // Filter by scheduled appointments
      await page.selectOption('select[name="statusFilter"]', 'scheduled');
      
      // Should only show scheduled appointments
      await expect(page.getByText('Scheduled')).toBeVisible();
      await expect(page.getByText('Completed')).not.toBeVisible();
    });
  });

  test.describe('Appointment Modification', () => {
    test('should reschedule an appointment', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      
      // Click reschedule button for first appointment
      await page.click('button[aria-label="Reschedule appointment"]:first-of-type');
      
      // Change the time
      await page.fill('input[type="time"]', '14:00');
      await page.click('button:has-text("Update Appointment")');
      
      // Verify success
      await expect(page.getByText('Appointment rescheduled successfully')).toBeVisible();
    });

    test('should cancel an appointment', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      
      // Click cancel button
      await page.click('button[aria-label="Cancel appointment"]:first-of-type');
      
      // Confirm cancellation
      await page.fill('textarea[name="cancellationReason"]', 'Patient requested cancellation');
      await page.click('button:has-text("Confirm Cancellation")');
      
      // Verify cancellation
      await expect(page.getByText('Appointment cancelled successfully')).toBeVisible();
    });

    test('should mark appointment as completed', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      
      // Click complete button
      await page.click('button[aria-label="Mark as completed"]:first-of-type');
      
      // Add completion notes
      await page.fill('textarea[name="completionNotes"]', 'Session completed successfully');
      await page.click('button:has-text("Mark Completed")');
      
      // Verify completion
      await expect(page.getByText('Appointment marked as completed')).toBeVisible();
    });
  });

  test.describe('Appointment Notifications', () => {
    test('should send reminder notifications', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      
      // Click send reminder button
      await page.click('button[aria-label="Send reminder"]:first-of-type');
      
      // Verify reminder sent
      await expect(page.getByText('Reminder sent successfully')).toBeVisible();
    });
  });

  test.describe('Bulk Operations', () => {
    test('should select multiple appointments', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      
      // Select multiple checkboxes
      await page.check('input[type="checkbox"][data-appointment-id]:first-of-type');
      await page.check('input[type="checkbox"][data-appointment-id]:nth-of-type(2)');
      
      // Bulk actions should be available
      await expect(page.getByText('2 appointments selected')).toBeVisible();
      await expect(page.getByText('Bulk Actions')).toBeVisible();
    });

    test('should bulk reschedule appointments', async () => {
      await page.click('a[href="/dashboard/physiotherapist/appointments"]');
      
      // Select appointments and bulk reschedule
      await page.check('input[type="checkbox"][data-appointment-id]:first-of-type');
      await page.check('input[type="checkbox"][data-appointment-id]:nth-of-type(2)');
      
      await page.click('button:has-text("Bulk Actions")');
      await page.click('button:has-text("Reschedule Selected")');
      
      // Fill bulk reschedule form
      await page.fill('input[type="date"]', '2024-12-31');
      await page.click('button:has-text("Reschedule All")');
      
      await expect(page.getByText('Appointments rescheduled successfully')).toBeVisible();
    });
  });
}); 