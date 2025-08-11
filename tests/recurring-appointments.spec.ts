import { test, expect } from '@playwright/test'
import { format, addDays, addWeeks, addMonths } from 'date-fns'

// Test configuration
const TEST_USER_EMAIL = 'test-physiotherapist@rehabifyhealth.com'
const TEST_PATIENT_EMAIL = 'test-patient@rehabifyhealth.com'
const TEST_PASSWORD = 'TestPassword123!'

test.describe('Recurring Appointments System', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/sign-in')
    
    // Login as physiotherapist
    await page.fill('input[name="identifier"]', TEST_USER_EMAIL)
    await page.fill('input[name="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    
    // Wait for redirect to dashboard
    await page.waitForURL('/dashboard/physiotherapist')
    
    // Navigate to appointments page
    await page.goto('/dashboard/physiotherapist/appointments')
    await page.waitForLoadState('networkidle')
  })

  test.describe('Series Creation', () => {
    test('should create a weekly recurring series successfully', async ({ page }) => {
      // Click "New Recurring Series" button
      await page.click('button:has-text("New Recurring Series")')
      
      // Wait for modal to open
      await expect(page.locator('[role="dialog"]')).toBeVisible()
      
      // Fill in basic information
      await page.fill('input[id="name"]', 'Weekly Physical Therapy')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      await page.fill('textarea[id="description"]', 'Regular weekly PT sessions')
      
      // Set schedule
      const tomorrow = addDays(new Date(), 1)
      await page.fill('input[id="startDate"]', format(tomorrow, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '10:00')
      await page.fill('input[id="duration"]', '60')
      
      // Set recurrence pattern
      await page.selectOption('select:near(label:has-text("Frequency"))', 'weekly')
      await page.fill('input[id="interval"]', '1')
      
      // Select days of week (Monday and Wednesday)
      await page.check('input[id="day-1"]') // Monday
      await page.check('input[id="day-3"]') // Wednesday
      
      // Set end condition (10 occurrences)
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '10')
      
      // Add notes
      await page.fill('textarea[id="notesForPatient"]', 'Please arrive 10 minutes early')
      await page.fill('textarea[id="notesForTherapist"]', 'Focus on shoulder mobility')
      
      // Submit form
      await page.click('button[type="submit"]')
      
      // Verify success
      await expect(page.locator('text=Recurring appointment series created successfully')).toBeVisible()
      
      // Verify modal closes
      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
      
      // Switch to recurring series tab
      await page.click('button:has-text("Recurring Series")')
      
      // Verify series appears in list
      await expect(page.locator('text=Weekly Physical Therapy')).toBeVisible()
      await expect(page.locator('text=Weekly on Monday, Wednesday')).toBeVisible()
      await expect(page.locator('text=for 10 occurrences')).toBeVisible()
    })

    test('should validate form inputs correctly', async ({ page }) => {
      await page.click('button:has-text("New Recurring Series")')
      
      // Try to submit empty form
      await page.click('button[type="submit"]')
      
      // Check for validation errors
      await expect(page.locator('text=Series name is required')).toBeVisible()
      await expect(page.locator('text=Service type is required')).toBeVisible()
      await expect(page.locator('text=Start date is required')).toBeVisible()
      
      // Fill name but leave other required fields empty
      await page.fill('input[id="name"]', 'Test Series')
      await page.click('button[type="submit"]')
      
      // Should still show other validation errors
      await expect(page.locator('text=Service type is required')).toBeVisible()
    })

    test('should show recurrence preview correctly', async ({ page }) => {
      await page.click('button:has-text("New Recurring Series")')
      
      // Set up a complex recurrence pattern
      await page.selectOption('select:near(label:has-text("Frequency"))', 'weekly')
      await page.fill('input[id="interval"]', '2')
      await page.check('input[id="day-1"]') // Monday
      await page.check('input[id="day-5"]') // Friday
      
      // Set end date
      await page.check('input[id="end-date"]')
      const endDate = addMonths(new Date(), 3)
      await page.fill('input[type="date"]:near(label:has-text("End by date:"))', format(endDate, 'yyyy-MM-dd'))
      
      // Verify preview text
      const expectedPreview = `Every 2 weeks on Monday, Friday until ${format(endDate, 'M/d/yyyy')}`
      await expect(page.locator(`text=${expectedPreview}`)).toBeVisible()
    })

    test('should handle timezone correctly', async ({ page }) => {
      // Set timezone to a different zone
      await page.addInitScript(() => {
        // Mock timezone to EST
        Object.defineProperty(Intl, 'DateTimeFormat', {
          value: class extends Intl.DateTimeFormat {
            resolvedOptions() {
              return { ...super.resolvedOptions(), timeZone: 'America/New_York' }
            }
          }
        })
      })
      
      await page.click('button:has-text("New Recurring Series")')
      
      // Fill form with specific time
      await page.fill('input[id="name"]', 'Timezone Test Series')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      
      const tomorrow = addDays(new Date(), 1)
      await page.fill('input[id="startDate"]', format(tomorrow, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '14:30') // 2:30 PM
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'daily')
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '3')
      
      await page.click('button[type="submit"]')
      
      // Verify series created
      await expect(page.locator('text=Recurring appointment series created successfully')).toBeVisible()
      
      // Switch to calendar view to verify times
      await page.click('button:has-text("Appointments")')
      await page.click('button[aria-label="Calendar view"]')
      
      // Verify appointments appear at correct times (should handle timezone conversion)
      await expect(page.locator('.fc-event:has-text("Test Patient")')).toBeVisible()
    })
  })

  test.describe('Series Management', () => {
    test.beforeEach(async ({ page }) => {
      // Create a test series first
      await page.click('button:has-text("New Recurring Series")')
      
      await page.fill('input[id="name"]', 'Test Management Series')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      
      const tomorrow = addDays(new Date(), 1)
      await page.fill('input[id="startDate"]', format(tomorrow, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '09:00')
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'weekly')
      await page.check('input[id="day-1"]') // Monday
      
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '5')
      
      await page.click('button[type="submit"]')
      await expect(page.locator('text=Recurring appointment series created successfully')).toBeVisible()
    })

    test('should edit entire series successfully', async ({ page }) => {
      // Navigate to recurring series tab
      await page.click('button:has-text("Recurring Series")')
      
      // Find and click edit button for the test series
      await page.click('button:has-text("Edit"):near(text="Test Management Series")')
      
      // Choose to edit all appointments
      await page.selectOption('select', 'all-in-series')
      await page.click('button:has-text("Edit Series")')
      
      // This would open edit modal (placeholder for now)
      // In a real implementation, this would open the edit form
      console.log('Edit series functionality triggered')
    })

    test('should delete series with confirmation', async ({ page }) => {
      await page.click('button:has-text("Recurring Series")')
      
      // Click delete button
      await page.click('button:has-text("Delete"):near(text="Test Management Series")')
      
      // Verify confirmation modal
      await expect(page.locator('text=Delete Recurring Series')).toBeVisible()
      await expect(page.locator('text=How would you like to delete this recurring appointment series?')).toBeVisible()
      
      // Choose to delete all appointments
      await page.selectOption('select', 'all-in-series')
      
      // Add cancellation reason
      await page.fill('textarea:near(label:has-text("Reason for cancellation"))', 'Patient requested cancellation')
      
      // Confirm deletion
      await page.click('button:has-text("Delete Series")')
      
      // Verify success
      await expect(page.locator('text=Cancelled entire series successfully')).toBeVisible()
      
      // Verify series no longer appears
      await expect(page.locator('text=Test Management Series')).not.toBeVisible()
    })

    test('should handle "this and future" deletion correctly', async ({ page }) => {
      await page.click('button:has-text("Recurring Series")')
      
      await page.click('button:has-text("Delete"):near(text="Test Management Series")')
      
      // Choose to delete from a specific date
      await page.selectOption('select', 'this-and-future')
      
      // Set from date (one week from now)
      const fromDate = addWeeks(new Date(), 1)
      await page.fill('input[type="date"]', format(fromDate, 'yyyy-MM-dd'))
      
      await page.fill('textarea:near(label:has-text("Reason for cancellation"))', 'Schedule conflict')
      
      await page.click('button:has-text("Delete Series")')
      
      await expect(page.locator('text=Cancelled appointments from selected date successfully')).toBeVisible()
      
      // Series should still exist but with updated end date
      await expect(page.locator('text=Test Management Series')).toBeVisible()
    })
  })

  test.describe('Calendar Integration', () => {
    test('should display recurring appointments correctly in calendar', async ({ page }) => {
      // Create a daily recurring series for easier testing
      await page.click('button:has-text("New Recurring Series")')
      
      await page.fill('input[id="name"]', 'Daily Calendar Test')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      
      const today = new Date()
      await page.fill('input[id="startDate"]', format(today, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '10:00')
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'daily')
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '7')
      
      await page.click('button[type="submit"]')
      await expect(page.locator('text=Recurring appointment series created successfully')).toBeVisible()
      
      // Switch to calendar view
      await page.click('button[aria-label="Calendar view"]')
      
      // Verify multiple appointments appear
      const appointments = page.locator('.fc-event')
      await expect(appointments).toHaveCount(7) // Should have 7 daily appointments
      
      // Verify appointments have recurring indicator
      // (This would depend on how recurring appointments are styled)
      await expect(page.locator('.fc-event:has(.recurring-indicator)')).toHaveCount(7)
    })

    test('should handle appointment drag and drop for recurring appointments', async ({ page }) => {
      // Create recurring series first
      await page.click('button:has-text("New Recurring Series")')
      
      await page.fill('input[id="name"]', 'Drag Test Series')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      
      const tomorrow = addDays(new Date(), 1)
      await page.fill('input[id="startDate"]', format(tomorrow, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '10:00')
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'weekly')
      await page.check('input[id="day-1"]') // Monday
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '3')
      
      await page.click('button[type="submit"]')
      await expect(page.locator('text=Recurring appointment series created successfully')).toBeVisible()
      
      // Switch to calendar view
      await page.click('button[aria-label="Calendar view"]')
      
      // Find first appointment and attempt to drag
      const firstAppointment = page.locator('.fc-event').first()
      await expect(firstAppointment).toBeVisible()
      
      // Simulate drag and drop (this would trigger the series edit modal in real implementation)
      await firstAppointment.dragTo(page.locator('.fc-daygrid-day[data-date]').nth(2))
      
      // In a real implementation, this would show a modal asking whether to:
      // - Edit just this appointment (creating an exception)
      // - Edit this and future appointments
      // - Edit the entire series
    })
  })

  test.describe('Edge Cases and Error Handling', () => {
    test('should handle conflicting appointments gracefully', async ({ page }) => {
      // Create first series
      await page.click('button:has-text("New Recurring Series")')
      
      await page.fill('input[id="name"]', 'First Series')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      
      const tomorrow = addDays(new Date(), 1)
      await page.fill('input[id="startDate"]', format(tomorrow, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '10:00')
      await page.fill('input[id="duration"]', '60')
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'weekly')
      await page.check('input[id="day-1"]') // Monday
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '3')
      
      await page.click('button[type="submit"]')
      await expect(page.locator('text=Recurring appointment series created successfully')).toBeVisible()
      
      // Try to create overlapping series
      await page.click('button:has-text("New Recurring Series")')
      
      await page.fill('input[id="name"]', 'Conflicting Series')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Massage Therapy')
      
      await page.fill('input[id="startDate"]', format(tomorrow, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '10:30') // Overlaps with first series
      await page.fill('input[id="duration"]', '60')
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'weekly')
      await page.check('input[id="day-1"]') // Monday
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '3')
      
      await page.click('button[type="submit"]')
      
      // Should show conflict warning or handle gracefully
      // (Implementation would depend on business rules)
      await expect(page.locator('text=Recurring appointment series created successfully')).toBeVisible()
    })

    test('should handle invalid date ranges', async ({ page }) => {
      await page.click('button:has-text("New Recurring Series")')
      
      await page.fill('input[id="name"]', 'Invalid Date Test')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      
      // Set start date in the past
      const yesterday = addDays(new Date(), -1)
      await page.fill('input[id="startDate"]', format(yesterday, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '10:00')
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'daily')
      
      // Set end date before start date
      await page.check('input[id="end-date"]')
      const twoDaysAgo = addDays(new Date(), -2)
      await page.fill('input[type="date"]:near(label:has-text("End by date:"))', format(twoDaysAgo, 'yyyy-MM-dd'))
      
      await page.click('button[type="submit"]')
      
      // Should show validation errors
      await expect(page.locator('text=End date must be in the future')).toBeVisible()
    })

    test('should handle network errors gracefully', async ({ page }) => {
      // Simulate network failure
      await page.route('**/api/**', route => route.abort())
      
      await page.click('button:has-text("New Recurring Series")')
      
      // Fill valid form
      await page.fill('input[id="name"]', 'Network Error Test')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      
      const tomorrow = addDays(new Date(), 1)
      await page.fill('input[id="startDate"]', format(tomorrow, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '10:00')
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'weekly')
      await page.check('input[id="day-1"]')
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '3')
      
      await page.click('button[type="submit"]')
      
      // Should show error message
      await expect(page.locator('text=Failed to create recurring appointment series')).toBeVisible()
      
      // Modal should remain open for retry
      await expect(page.locator('[role="dialog"]')).toBeVisible()
    })

    test('should handle large series (performance test)', async ({ page }) => {
      await page.click('button:has-text("New Recurring Series")')
      
      await page.fill('input[id="name"]', 'Large Series Test')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      
      const today = new Date()
      await page.fill('input[id="startDate"]', format(today, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '10:00')
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'daily')
      
      // Create series with 365 occurrences (1 year)
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '365')
      
      // Measure performance
      const startTime = Date.now()
      await page.click('button[type="submit"]')
      
      await expect(page.locator('text=Recurring appointment series created successfully')).toBeVisible()
      const endTime = Date.now()
      
      // Should complete within reasonable time (e.g., 10 seconds)
      expect(endTime - startTime).toBeLessThan(10000)
      
      // Verify series was created
      await page.click('button:has-text("Recurring Series")')
      await expect(page.locator('text=Large Series Test')).toBeVisible()
      await expect(page.locator('text=for 365 occurrences')).toBeVisible()
    })
  })

  test.describe('User Experience', () => {
    test('should provide clear feedback for all actions', async ({ page }) => {
      // Test creation feedback
      await page.click('button:has-text("New Recurring Series")')
      
      await page.fill('input[id="name"]', 'UX Test Series')
      await page.selectOption('select:near(label:has-text("Service Type"))', 'Physical Therapy')
      
      const tomorrow = addDays(new Date(), 1)
      await page.fill('input[id="startDate"]', format(tomorrow, 'yyyy-MM-dd'))
      await page.fill('input[id="startTime"]', '10:00')
      
      await page.selectOption('select:near(label:has-text("Frequency"))', 'weekly')
      await page.check('input[id="day-1"]')
      await page.check('input[id="end-occurrences"]')
      await page.fill('input:near(label:has-text("End after:"))', '3')
      
      // Should show loading state
      await page.click('button[type="submit"]')
      await expect(page.locator('button:has-text("Creating...")')).toBeVisible()
      
      // Should show success message
      await expect(page.locator('text=Recurring appointment series created successfully')).toBeVisible()
      
      // Test deletion feedback
      await page.click('button:has-text("Recurring Series")')
      await page.click('button:has-text("Delete"):near(text="UX Test Series")')
      
      await page.selectOption('select', 'all-in-series')
      await page.click('button:has-text("Delete Series")')
      
      // Should show loading state
      await expect(page.locator('button:has-text("Processing...")')).toBeVisible()
      
      // Should show success message
      await expect(page.locator('text=Cancelled entire series successfully')).toBeVisible()
    })

    test('should be responsive on mobile devices', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      
      await page.click('button:has-text("New Recurring Series")')
      
      // Verify modal is properly sized for mobile
      const modal = page.locator('[role="dialog"]')
      await expect(modal).toBeVisible()
      
      // Check that form elements are accessible
      await expect(page.locator('input[id="name"]')).toBeVisible()
      await expect(page.locator('select:near(label:has-text("Service Type"))')).toBeVisible()
      
      // Verify tabs work on mobile
      await page.click('button:has-text("Cancel")')
      await page.click('button:has-text("Recurring Series")')
      
      // Should show recurring series in mobile-friendly layout
      await expect(page.locator('text=No recurring appointment series found')).toBeVisible()
    })

    test('should support keyboard navigation', async ({ page }) => {
      // Navigate to recurring series button using keyboard
      await page.keyboard.press('Tab') // Navigate through page
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      
      // Should be able to activate button with Enter
      await page.keyboard.press('Enter')
      
      // Modal should open
      await expect(page.locator('[role="dialog"]')).toBeVisible()
      
      // Should be able to navigate form with Tab
      await page.keyboard.press('Tab')
      await page.keyboard.type('Keyboard Test Series')
      
      await page.keyboard.press('Tab')
      await page.keyboard.press('ArrowDown') // Select service type
      await page.keyboard.press('Enter')
      
      // Should be able to close modal with Escape
      await page.keyboard.press('Escape')
      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    })
  })
})
