import { test, expect } from '@playwright/test';
import { Page } from '@playwright/test';

test.describe('Treatment Plan Management', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    
    // Sign in as physiotherapist
    await page.goto('/sign-in');
    await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
    await page.fill('input[type="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    
    // Navigate to patient details page
    await page.waitForURL('/dashboard/physiotherapist');
    await page.click('a[href="/dashboard/physiotherapist/patients"]');
    await page.click('tbody tr:first-child a'); // Click first patient
    await page.click('button[data-value="treatment"]'); // Go to treatment plans tab
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('Treatment Plan Creation', () => {
    test('should create a comprehensive treatment plan', async () => {
      await page.click('button:has-text("New Treatment Plan")');
      
      // Fill basic information
      await page.fill('input[name="title"]', 'Post-Surgery Knee Rehabilitation');
      await page.fill('textarea[name="description"]', 'Comprehensive rehabilitation plan following ACL reconstruction surgery');
      await page.fill('input[name="startDate"]', '2024-01-15');
      await page.fill('input[name="endDate"]', '2024-04-15');
      await page.selectOption('select[name="priority"]', 'high');
      
      // Add treatment goals
      await page.click('button:has-text("Add Goal")');
      await page.fill('input[name="goals[0].description"]', 'Restore full range of motion in knee joint');
      await page.fill('input[name="goals[0].targetValue"]', '0-135 degrees flexion');
      await page.fill('input[name="goals[0].timeline"]', '8 weeks');
      
      await page.click('button:has-text("Add Goal")');
      await page.fill('input[name="goals[1].description"]', 'Regain quadriceps strength');
      await page.fill('input[name="goals[1].targetValue"]', '90% of unaffected leg');
      await page.fill('input[name="goals[1].timeline"]', '12 weeks');
      
      // Add treatment phases
      await page.click('button:has-text("Add Phase")');
      await page.fill('input[name="phases[0].name"]', 'Acute Phase');
      await page.fill('textarea[name="phases[0].description"]', 'Focus on pain and swelling reduction');
      await page.fill('input[name="phases[0].duration"]', '2 weeks');
      
      await page.click('button:has-text("Add Phase")');
      await page.fill('input[name="phases[1].name"]', 'Mobility Phase');
      await page.fill('textarea[name="phases[1].description"]', 'Restore range of motion and basic strength');
      await page.fill('input[name="phases[1].duration"]', '6 weeks');
      
      // Add exercises to first phase
      await page.click('button[data-phase="0"]:has-text("Add Exercise")');
      await page.selectOption('select[name="phases[0].exercises[0].exerciseId"]', 'ankle-pumps');
      await page.fill('input[name="phases[0].exercises[0].sets"]', '3');
      await page.fill('input[name="phases[0].exercises[0].reps"]', '20');
      await page.fill('input[name="phases[0].exercises[0].frequency"]', 'Daily');
      
      // Set review intervals
      await page.fill('input[name="reviewInterval"]', '2'); // Every 2 weeks
      await page.fill('textarea[name="notes"]', 'Patient is motivated and compliant. Monitor for any signs of complications.');
      
      // Submit treatment plan
      await page.click('button:has-text("Create Treatment Plan")');
      
      // Verify success
      await expect(page.getByText('Treatment plan created successfully')).toBeVisible();
      await expect(page.getByText('Post-Surgery Knee Rehabilitation')).toBeVisible();
    });

    test('should validate required fields', async () => {
      await page.click('button:has-text("New Treatment Plan")');
      
      // Try to submit without required fields
      await page.click('button:has-text("Create Treatment Plan")');
      
      // Check validation messages
      await expect(page.getByText('Treatment plan title is required')).toBeVisible();
      await expect(page.getByText('Start date is required')).toBeVisible();
      await expect(page.getByText('At least one goal is required')).toBeVisible();
    });

    test('should validate date ranges', async () => {
      await page.click('button:has-text("New Treatment Plan")');
      
      // Set end date before start date
      await page.fill('input[name="title"]', 'Test Plan');
      await page.fill('input[name="startDate"]', '2024-06-01');
      await page.fill('input[name="endDate"]', '2024-05-01');
      
      await page.click('button:has-text("Create Treatment Plan")');
      
      // Should show validation error
      await expect(page.getByText('End date must be after start date')).toBeVisible();
    });
  });

  test.describe('Treatment Plan Templates', () => {
    test('should create plan from template', async () => {
      await page.click('button:has-text("Use Template")');
      
      // Select a template
      await page.click('div[data-template="lower-back-pain"]');
      await page.click('button:has-text("Use This Template")');
      
      // Template should pre-fill form
      await expect(page.locator('input[name="title"]')).toHaveValue('Lower Back Pain Rehabilitation');
      await expect(page.getByText('Reduce pain and improve mobility')).toBeVisible();
      
      // Customize and save
      await page.fill('input[name="startDate"]', '2024-01-15');
      await page.fill('input[name="endDate"]', '2024-03-15');
      await page.click('button:has-text("Create Treatment Plan")');
      
      await expect(page.getByText('Treatment plan created successfully')).toBeVisible();
    });

    test('should save custom plan as template', async () => {
      // First create a custom plan
      await page.click('button:has-text("New Treatment Plan")');
      await page.fill('input[name="title"]', 'Custom Shoulder Rehabilitation');
      await page.fill('textarea[name="description"]', 'Specialized plan for rotator cuff injuries');
      
      // Fill other required fields...
      await page.fill('input[name="startDate"]', '2024-01-15');
      await page.click('button:has-text("Add Goal")');
      await page.fill('input[name="goals[0].description"]', 'Restore shoulder mobility');
      
      // Save as template
      await page.check('input[name="saveAsTemplate"]');
      await page.fill('input[name="templateName"]', 'Rotator Cuff Rehabilitation');
      
      await page.click('button:has-text("Create Treatment Plan")');
      
      await expect(page.getByText('Treatment plan created and saved as template')).toBeVisible();
    });
  });

  test.describe('Treatment Plan Management', () => {
    test('should view treatment plan details', async () => {
      // Click on existing treatment plan
      await page.click('div[data-treatment-plan]:first-child');
      
      // Should show detailed view
      await expect(page.getByText('Treatment Plan Details')).toBeVisible();
      await expect(page.getByText('Goals')).toBeVisible();
      await expect(page.getByText('Phases')).toBeVisible();
      await expect(page.getByText('Progress')).toBeVisible();
    });

    test('should edit treatment plan', async () => {
      await page.click('button[aria-label="Edit treatment plan"]:first-of-type');
      
      // Modify plan
      await page.fill('input[name="title"]', 'Updated Treatment Plan');
      await page.fill('textarea[name="description"]', 'Updated description with new focus areas');
      
      // Add new goal
      await page.click('button:has-text("Add Goal")');
      await page.fill('input[name="goals[2].description"]', 'Improve functional movement patterns');
      
      await page.click('button:has-text("Update Treatment Plan")');
      
      await expect(page.getByText('Treatment plan updated successfully')).toBeVisible();
      await expect(page.getByText('Updated Treatment Plan')).toBeVisible();
    });

    test('should update treatment plan status', async () => {
      await page.click('button[aria-label="Update status"]:first-of-type');
      
      // Change status to in progress
      await page.selectOption('select[name="status"]', 'in_progress');
      await page.fill('textarea[name="statusNotes"]', 'Patient has begun phase 1 exercises');
      
      await page.click('button:has-text("Update Status")');
      
      await expect(page.getByText('Status updated successfully')).toBeVisible();
      await expect(page.getByText('In Progress')).toBeVisible();
    });

    test('should duplicate treatment plan', async () => {
      await page.click('button[aria-label="Duplicate plan"]:first-of-type');
      
      // Modify duplicated plan
      await page.fill('input[name="title"]', 'Duplicated Plan - Modified');
      await page.fill('input[name="startDate"]', '2024-02-01');
      
      await page.click('button:has-text("Create Duplicate")');
      
      await expect(page.getByText('Treatment plan duplicated successfully')).toBeVisible();
      await expect(page.getByText('Duplicated Plan - Modified')).toBeVisible();
    });
  });

  test.describe('Progress Tracking', () => {
    test('should record progress update', async () => {
      await page.click('div[data-treatment-plan]:first-child');
      await page.click('button:has-text("Record Progress")');
      
      // Fill progress form
      await page.selectOption('select[name="goalId"]', { index: 0 });
      await page.fill('input[name="currentValue"]', '75%');
      await page.fill('textarea[name="progressNotes"]', 'Patient showing good improvement in strength');
      await page.selectOption('select[name="progressRating"]', 'good');
      
      // Add measurement
      await page.fill('input[name="measurements[0].type"]', 'Range of Motion');
      await page.fill('input[name="measurements[0].value"]', '120 degrees');
      await page.fill('input[name="measurements[0].unit"]', 'degrees');
      
      await page.click('button:has-text("Save Progress")');
      
      await expect(page.getByText('Progress recorded successfully')).toBeVisible();
    });

    test('should view progress charts', async () => {
      await page.click('div[data-treatment-plan]:first-child');
      await page.click('button:has-text("View Charts")');
      
      // Should show progress visualization
      await expect(page.locator('canvas, svg')).toBeVisible(); // Chart element
      await expect(page.getByText('Progress Over Time')).toBeVisible();
      
      // Switch between different chart types
      await page.click('button:has-text("Pain Levels")');
      await page.click('button:has-text("Functional Scores")');
      await page.click('button:has-text("Range of Motion")');
    });

    test('should generate progress report', async () => {
      await page.click('div[data-treatment-plan]:first-child');
      await page.click('button:has-text("Generate Report")');
      
      // Select report options
      await page.check('input[name="includeGoals"]');
      await page.check('input[name="includeProgress"]');
      await page.check('input[name="includeMeasurements"]');
      await page.selectOption('select[name="reportPeriod"]', 'last_month');
      
      await page.click('button:has-text("Generate Report")');
      
      await expect(page.getByText('Report generated successfully')).toBeVisible();
    });
  });

  test.describe('Exercise Integration', () => {
    test('should assign exercises to treatment phase', async () => {
      await page.click('div[data-treatment-plan]:first-child');
      await page.click('button:has-text("Manage Exercises")');
      
      // Select phase
      await page.selectOption('select[name="phaseId"]', { index: 0 });
      
      // Add exercise
      await page.click('button:has-text("Add Exercise")');
      await page.selectOption('select[name="exerciseId"]', 'quad-strengthening');
      await page.fill('input[name="sets"]', '3');
      await page.fill('input[name="reps"]', '15');
      await page.fill('input[name="hold"]', '5 seconds');
      await page.selectOption('select[name="frequency"]', 'daily');
      
      // Set progression criteria
      await page.fill('textarea[name="progressionNotes"]', 'Increase resistance when patient can complete 3x15 with ease');
      
      await page.click('button:has-text("Add Exercise")');
      
      await expect(page.getByText('Exercise added to treatment plan')).toBeVisible();
    });

    test('should modify exercise parameters', async () => {
      await page.click('div[data-treatment-plan]:first-child');
      await page.click('button[aria-label="Edit exercise"]:first-of-type');
      
      // Modify parameters
      await page.fill('input[name="sets"]', '4');
      await page.fill('input[name="reps"]', '20');
      await page.fill('input[name="resistance"]', '5 lbs');
      
      await page.click('button:has-text("Update Exercise")');
      
      await expect(page.getByText('Exercise updated successfully')).toBeVisible();
    });
  });

  test.describe('Collaboration Features', () => {
    test('should share treatment plan with team', async () => {
      await page.click('div[data-treatment-plan]:first-child');
      await page.click('button:has-text("Share Plan")');
      
      // Select team members to share with
      await page.check('input[data-therapist="dr-smith"]');
      await page.check('input[data-therapist="nurse-johnson"]');
      
      // Add sharing notes
      await page.fill('textarea[name="shareNotes"]', 'Please review exercise progressions for next phase');
      
      await page.click('button:has-text("Share with Team")');
      
      await expect(page.getByText('Treatment plan shared successfully')).toBeVisible();
    });

    test('should add team comments', async () => {
      await page.click('div[data-treatment-plan]:first-child');
      await page.click('button:has-text("Comments")');
      
      // Add comment
      await page.fill('textarea[name="comment"]', 'Patient responding well to current exercises. Consider advancing to next phase.');
      await page.click('button:has-text("Add Comment")');
      
      await expect(page.getByText('Comment added successfully')).toBeVisible();
      await expect(page.getByText('Patient responding well to current exercises')).toBeVisible();
    });
  });

  test.describe('Plan Completion', () => {
    test('should complete treatment plan', async () => {
      await page.click('button[aria-label="Complete plan"]:first-of-type');
      
      // Fill completion form
      await page.selectOption('select[name="completionReason"]', 'goals_achieved');
      await page.fill('textarea[name="outcomeNotes"]', 'All goals successfully achieved. Patient has returned to full function.');
      
      // Rate overall success
      await page.click('input[name="successRating"][value="5"]');
      
      // Add recommendations
      await page.fill('textarea[name="futureRecommendations"]', 'Continue home exercise program. Return if symptoms recur.');
      
      await page.click('button:has-text("Complete Plan")');
      
      await expect(page.getByText('Treatment plan completed successfully')).toBeVisible();
      await expect(page.getByText('Completed')).toBeVisible();
    });

    test('should archive completed plans', async () => {
      // First complete a plan
      await page.click('button[aria-label="Complete plan"]:first-of-type');
      await page.selectOption('select[name="completionReason"]', 'goals_achieved');
      await page.click('button:has-text("Complete Plan")');
      
      // Archive the completed plan
      await page.click('button[aria-label="Archive plan"]:first-of-type');
      await page.click('button:has-text("Confirm Archive")');
      
      await expect(page.getByText('Treatment plan archived')).toBeVisible();
      
      // Check archived plans view
      await page.click('button:has-text("View Archived")');
      await expect(page.getByText('Archived Plans')).toBeVisible();
    });
  });
}); 