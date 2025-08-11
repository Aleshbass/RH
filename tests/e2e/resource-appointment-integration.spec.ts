import { test, expect } from '@playwright/test';

test.describe('Resource Management and Appointment Booking Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Login as physiotherapist
    await page.goto('/sign-in');
    await page.fill('[data-testid="email-input"]', 'physio@test.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="sign-in-button"]');
    
    // Wait for dashboard to load
    await page.waitForURL('/dashboard/physiotherapist');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should create appointment with resource selection and availability checking', async ({ page }) => {
    // Navigate to appointments page
    await page.click('[data-testid="nav-appointments"]');
    await page.waitForURL('/dashboard/physiotherapist/appointments');
    
    // Click "New Appointment" button
    await page.click('button:has-text("New Appointment")');
    
    // Wait for enhanced appointment booking modal to open
    await expect(page.locator('[data-testid="appointment-booking-modal"]')).toBeVisible();
    
    // Fill appointment details
    await page.fill('[data-testid="appointment-date"]', '2024-12-25');
    await page.fill('[data-testid="appointment-time"]', '10:00');
    await page.selectOption('[data-testid="appointment-duration"]', '60');
    await page.fill('[data-testid="service-type"]', 'Physical Therapy Session');
    
    // Select patient
    await page.click('[data-testid="patient-select"]');
    await page.click('[data-testid="patient-option"]:first-child');
    
    // Wait for resources to load with availability
    await expect(page.locator('[data-testid="loading-resources"]')).toBeHidden();
    
    // Verify resources are displayed with availability status
    const availableResources = page.locator('[data-testid="resource-item"]:has([data-testid="available-badge"])');
    const unavailableResources = page.locator('[data-testid="resource-item"]:has([data-testid="unavailable-badge"])');
    
    await expect.poll(async () => await availableResources.count()).toBeGreaterThan(0);
    
    // Select an available resource
    await availableResources.first().click();
    
    // Verify resource is selected
    await expect(availableResources.first()).toHaveClass(/border-blue-500/);
    
    // Try to select an unavailable resource (should not work)
    if (await unavailableResources.count() > 0) {
      const initialSelectedCount = await page.locator('[data-testid="resource-item"].border-blue-500').count();
      await unavailableResources.first().click();
      const finalSelectedCount = await page.locator('[data-testid="resource-item"].border-blue-500').count();
      expect(finalSelectedCount).toBe(initialSelectedCount); // Should not change
    }
    
    // Create appointment
    await page.click('[data-testid="create-appointment-button"]');
    
    // Verify success message
    await expect(page.locator('.sonner-toast')).toContainText('Appointment created successfully');
    
    // Verify modal closes
    await expect(page.locator('[data-testid="appointment-booking-modal"]')).toBeHidden();
    
    // Verify appointment appears in calendar/list
    await expect(page.locator('[data-testid="appointment-item"]')).toContainText('Physical Therapy Session');
  });

  test('should detect and display resource conflicts', async ({ page }) => {
    // Navigate to appointments page
    await page.click('[data-testid="nav-appointments"]');
    await page.waitForURL('/dashboard/physiotherapist/appointments');
    
    // Click "New Appointment" button
    await page.click('button:has-text("New Appointment")');
    
    // Wait for modal to open
    await expect(page.locator('[data-testid="appointment-booking-modal"]')).toBeVisible();
    
    // Fill appointment details for a time that will conflict
    await page.fill('[data-testid="appointment-date"]', '2024-12-25');
    await page.fill('[data-testid="appointment-time"]', '09:00'); // Conflicting time
    await page.selectOption('[data-testid="appointment-duration"]', '120'); // 2 hours
    
    // Select patient
    await page.click('[data-testid="patient-select"]');
    await page.click('[data-testid="patient-option"]:first-child');
    
    // Wait for resources to load
    await expect(page.locator('[data-testid="loading-resources"]')).toBeHidden();
    
    // Select a resource that will have conflicts
    const resourceWithConflict = page.locator('[data-testid="resource-item"]:has([data-testid="unavailable-badge"])').first();
    
    if (await resourceWithConflict.count() > 0) {
      // Force select the conflicted resource (for testing conflict detection)
      await resourceWithConflict.click();
      
      // Verify conflict alert is shown
      await expect(page.locator('[data-testid="resource-conflicts-alert"]')).toBeVisible();
      await expect(page.locator('[data-testid="conflict-reason"]')).toBeVisible();
      
      // Verify create button is disabled or shows warning
      const createButton = page.locator('[data-testid="create-appointment-button"]');
      const isDisabled = await createButton.isDisabled();
      const hasWarning = await page.locator('[data-testid="conflict-warning"]').isVisible();
      
      expect(isDisabled || hasWarning).toBe(true);
    }
  });

  test('should show resource operating hours and maintenance conflicts', async ({ page }) => {
    // Navigate to appointments page
    await page.click('[data-testid="nav-appointments"]');
    
    // Click "New Appointment" button
    await page.click('button:has-text("New Appointment")');
    
    // Fill appointment for outside operating hours
    await page.fill('[data-testid="appointment-date"]', '2024-12-25');
    await page.fill('[data-testid="appointment-time"]', '22:00'); // Late evening
    
    // Select patient
    await page.click('[data-testid="patient-select"]');
    await page.click('[data-testid="patient-option"]:first-child');
    
    // Wait for resources to load
    await expect(page.locator('[data-testid="loading-resources"]')).toBeHidden();
    
    // Verify resources show as unavailable due to operating hours
    const unavailableResources = page.locator('[data-testid="resource-item"]:has([data-testid="unavailable-badge"])');
    await expect.poll(async () => await unavailableResources.count()).toBeGreaterThan(0);
    
    // Check conflict reason shows operating hours issue
    const conflictReason = unavailableResources.first().locator('[data-testid="conflict-reason"]');
    await expect(conflictReason).toContainText(/operating hours|maintenance/i);
  });

  test('should integrate with resource dashboard and show real-time updates', async ({ page }) => {
    // Navigate to appointments page
    await page.click('[data-testid="nav-appointments"]');
    
    // Switch to Resources tab
    await page.click('[data-testid="resources-tab"]');
    
    // Verify resource dashboard loads
    await expect(page.locator('[data-testid="resource-dashboard"]')).toBeVisible();
    
    // Check resource statistics
    await expect(page.locator('[data-testid="total-resources"]')).toBeVisible();
    await expect(page.locator('[data-testid="available-resources"]')).toBeVisible();
    await expect(page.locator('[data-testid="utilization-rate"]')).toBeVisible();
    
    // Create a new resource
    await page.click('[data-testid="add-resource-button"]');
    await expect(page.locator('[data-testid="resource-modal"]')).toBeVisible();
    
    // Fill resource details
    await page.fill('[data-testid="resource-name"]', 'Test Equipment');
    await page.selectOption('[data-testid="resource-type"]', 'equipment');
    await page.fill('[data-testid="resource-description"]', 'Test equipment for E2E testing');
    await page.fill('[data-testid="resource-location"]', 'Room 101');
    
    // Set operating hours
    await page.fill('[data-testid="monday-start"]', '08:00');
    await page.fill('[data-testid="monday-end"]', '18:00');
    
    // Save resource
    await page.click('[data-testid="save-resource-button"]');
    
    // Verify success message
    await expect(page.locator('.sonner-toast')).toContainText('Resource created successfully');
    
    // Verify resource appears in dashboard
    await expect(page.locator('[data-testid="resource-item"]:has-text("Test Equipment")')).toBeVisible();
    
    // Switch back to appointments tab
    await page.click('[data-testid="appointments-tab"]');
    
    // Create new appointment to verify new resource is available
    await page.click('button:has-text("New Appointment")');
    
    // Fill appointment details
    await page.fill('[data-testid="appointment-date"]', '2024-12-25');
    await page.fill('[data-testid="appointment-time"]', '10:00');
    
    // Select patient
    await page.click('[data-testid="patient-select"]');
    await page.click('[data-testid="patient-option"]:first-child');
    
    // Wait for resources to load
    await expect(page.locator('[data-testid="loading-resources"]')).toBeHidden();
    
    // Verify new resource is available for selection
    await expect(page.locator('[data-testid="resource-item"]:has-text("Test Equipment")')).toBeVisible();
    await expect(page.locator('[data-testid="resource-item"]:has-text("Test Equipment") [data-testid="available-badge"]')).toBeVisible();
  });

  test('should handle resource booking conflicts and provide alternatives', async ({ page }) => {
    // Navigate to appointments page
    await page.click('[data-testid="nav-appointments"]');
    
    // Create first appointment to establish conflict
    await page.click('button:has-text("New Appointment")');
    
    // Fill first appointment
    await page.fill('[data-testid="appointment-date"]', '2024-12-25');
    await page.fill('[data-testid="appointment-time"]', '10:00');
    await page.selectOption('[data-testid="appointment-duration"]', '60');
    
    // Select patient and resource
    await page.click('[data-testid="patient-select"]');
    await page.click('[data-testid="patient-option"]:first-child');
    
    await expect(page.locator('[data-testid="loading-resources"]')).toBeHidden();
    const firstResource = page.locator('[data-testid="resource-item"]:has([data-testid="available-badge"])').first();
    await firstResource.click();
    
    // Create first appointment
    await page.click('[data-testid="create-appointment-button"]');
    await expect(page.locator('.sonner-toast')).toContainText('successfully');
    
    // Try to create conflicting appointment
    await page.click('button:has-text("New Appointment")');
    
    // Fill conflicting appointment details
    await page.fill('[data-testid="appointment-date"]', '2024-12-25');
    await page.fill('[data-testid="appointment-time"]', '10:30'); // Overlapping time
    await page.selectOption('[data-testid="appointment-duration"]', '60');
    
    // Select same patient
    await page.click('[data-testid="patient-select"]');
    await page.click('[data-testid="patient-option"]:first-child');
    
    // Wait for resources to load
    await expect(page.locator('[data-testid="loading-resources"]')).toBeHidden();
    
    // Try to select the same resource (should show as unavailable)
    const conflictedResource = page.locator('[data-testid="resource-item"]').first();
    
    // Verify resource shows as unavailable
    await expect(conflictedResource.locator('[data-testid="unavailable-badge"]')).toBeVisible();
    
    // Verify conflict reason is displayed
    await expect(conflictedResource.locator('[data-testid="conflict-reason"]')).toContainText('Already booked');
    
    // Select an alternative available resource
    const alternativeResource = page.locator('[data-testid="resource-item"]:has([data-testid="available-badge"])').first();
    await alternativeResource.click();
    
    // Should be able to create appointment with alternative resource
    await page.click('[data-testid="create-appointment-button"]');
    await expect(page.locator('.sonner-toast')).toContainText('successfully');
  });

  test('should validate resource capacity and show utilization', async ({ page }) => {
    // Navigate to resources tab
    await page.click('[data-testid="nav-appointments"]');
    await page.click('[data-testid="resources-tab"]');
    
    // Check resource utilization metrics
    await expect(page.locator('[data-testid="utilization-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="peak-hours"]')).toBeVisible();
    
    // Filter resources by type
    await page.selectOption('[data-testid="resource-type-filter"]', 'equipment');
    
    // Verify filtered results
    const equipmentResources = page.locator('[data-testid="resource-item"]');
    await expect.poll(async () => await equipmentResources.count()).toBeGreaterThan(0);
    
    // Check each resource shows capacity information
    const firstResource = equipmentResources.first();
    await expect(firstResource.locator('[data-testid="resource-capacity"]')).toBeVisible();
    
    // Click on resource to view details
    await firstResource.click();
    
    // Verify resource details modal opens
    await expect(page.locator('[data-testid="resource-details-modal"]')).toBeVisible();
    
    // Check utilization statistics
    await expect(page.locator('[data-testid="current-utilization"]')).toBeVisible();
    await expect(page.locator('[data-testid="weekly-utilization"]')).toBeVisible();
    await expect(page.locator('[data-testid="upcoming-bookings"]')).toBeVisible();
  });
});
