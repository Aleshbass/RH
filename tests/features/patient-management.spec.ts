import { test, expect } from '@playwright/test';

// Reuse authenticated state generated in global setup
test.describe.use({ storageState: 'tests/.auth/physio.json' });

test.describe('Patient Management', () => {
  test('setup', async ({ page }) => {
    // Navigate directly to dashboard to ensure session is active
    await page.goto('/dashboard/physiotherapist');
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test.describe('Patient Invitation', () => {
    test('should invite a new patient via email', async ({ page }) => {
      // Click invite patient from dashboard
      await page.click('button:has-text("Invite Patient")');
      
      // Fill invitation form
      await page.fill('input[name="patientEmail"]', 'newpatient@example.com');
      await page.fill('input[name="patientName"]', 'John Smith');
      await page.fill('textarea[name="notes"]', 'Welcome to our clinic!');
      
      // Send invitation
      await page.click('button:has-text("Send Invitation")');
      
      // Verify success
      await expect(page.getByText('Invitation sent successfully')).toBeVisible();
    });

    test('should validate email format', async ({ page }) => {
      await page.click('button:has-text("Invite Patient")');
      
      // Enter invalid email
      await page.fill('input[name="patientEmail"]', 'invalid-email');
      await page.fill('input[name="patientName"]', 'John Smith');
      
      await page.click('button:has-text("Send Invitation")');
      
      // Should show validation error
      await expect(page.getByText('Please enter a valid email address')).toBeVisible();
    });

    test('should prevent duplicate invitations', async ({ page }) => {
      await page.click('button:has-text("Invite Patient")');
      
      // Try to invite existing patient
      await page.fill('input[name="patientEmail"]', 'test.patient@example.com');
      await page.fill('input[name="patientName"]', 'Test Patient');
      
      await page.click('button:has-text("Send Invitation")');
      
      // Should show duplicate warning
      await expect(page.getByText('Patient already exists or has pending invitation')).toBeVisible();
    });
  });

  test.describe('Patient List View', () => {
    test('should display patient list', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.waitForURL('/dashboard/physiotherapist/patients');
      
      // Check patients table
      await expect(page.locator('table')).toBeVisible();
      await expect(page.getByText('Test Patient')).toBeVisible();
    });

    test('should search patients', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      
      // Search for patient
      await page.fill('input[placeholder="Search patients..."]', 'Test');
      
      // Should show filtered results
      await expect(page.getByText('Test Patient')).toBeVisible();
      
      // Search for non-existent patient
      await page.fill('input[placeholder="Search patients..."]', 'NonExistent');
      await expect(page.getByText('No patients found')).toBeVisible();
    });

    test('should filter patients by status', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      
      // Filter by active patients
      await page.selectOption('select[name="statusFilter"]', 'active');
      await expect(page.getByText('Test Patient')).toBeVisible();
      
      // Filter by inactive patients
      await page.selectOption('select[name="statusFilter"]', 'inactive');
      await expect(page.getByText('No patients found')).toBeVisible();
    });

    test('should sort patients', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      
      // Sort by name
      await page.click('th:has-text("Name")');
      
      // Should sort alphabetically
      const firstPatientName = await page.locator('tbody tr:first-child td:first-child').textContent();
      expect(firstPatientName).toBeTruthy();
    });
  });

  test.describe('Patient Details', () => {
    test('should view patient details', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      
      // Click on first patient
      await page.click('tbody tr:first-child a');
      
      // Should navigate to patient details
      await expect(page).toHaveURL(/\/dashboard\/physiotherapist\/patients\/.+/);
      
      // Check patient information tabs
      await expect(page.getByText('Overview')).toBeVisible();
      await expect(page.getByText('Appointments')).toBeVisible();
      await expect(page.getByText('Session Logs')).toBeVisible();
      await expect(page.getByText('Treatment Plans')).toBeVisible();
      await expect(page.getByText('Medical Info')).toBeVisible();
    });

    test('should display patient overview stats', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Check overview tab statistics
      await page.click('button[data-value="overview"]');
      
      await expect(page.getByText('Total Appointments')).toBeVisible();
      await expect(page.getByText('Session Logs')).toBeVisible();
      await expect(page.getByText('Treatment Plans')).toBeVisible();
    });

    test('should display patient appointments', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Switch to appointments tab
      await page.click('button[data-value="appointments"]');
      
      // Should show appointments list
      await expect(page.getByText('Initial Consultation')).toBeVisible();
      await expect(page.getByText('Scheduled')).toBeVisible();
    });

    test('should display session logs', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Switch to session logs tab
      await page.click('button[data-value="sessions"]');
      
      // Should show session logs
      await expect(page.getByText('Test subjective assessment')).toBeVisible();
      await expect(page.getByText('Test treatment')).toBeVisible();
    });
  });

  test.describe('Session Logging', () => {
    test('should create a new session log', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Go to sessions tab and create new log
      await page.click('button[data-value="sessions"]');
      await page.click('button:has-text("New Session Log")');
      
      // Fill session log form
      await page.fill('textarea[name="subjectiveAssessment"]', 'Patient reports improvement in mobility');
      await page.fill('textarea[name="objectiveAssessment"]', 'Increased range of motion observed');
      await page.fill('textarea[name="treatmentAdministered"]', 'Manual therapy and exercise prescription');
      await page.fill('textarea[name="planForNextSession"]', 'Continue with current treatment plan');
      
      // Submit session log
      await page.click('button:has-text("Save Session Log")');
      
      // Verify success
      await expect(page.getByText('Session log created successfully')).toBeVisible();
    });

    test('should edit existing session log', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Go to sessions tab and edit existing log
      await page.click('button[data-value="sessions"]');
      await page.click('button[aria-label="Edit session log"]:first-of-type');
      
      // Update session log
      await page.fill('textarea[name="subjectiveAssessment"]', 'Updated assessment information');
      await page.click('button:has-text("Update Session Log")');
      
      // Verify update
      await expect(page.getByText('Session log updated successfully')).toBeVisible();
    });
  });

  test.describe('Treatment Plans', () => {
    test('should create a treatment plan', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Go to treatment plans tab
      await page.click('button[data-value="treatment"]');
      await page.click('button:has-text("New Treatment Plan")');
      
      // Fill treatment plan form
      await page.fill('input[name="title"]', 'Lower Back Rehabilitation');
      await page.fill('textarea[name="description"]', 'Comprehensive plan for lower back pain recovery');
      await page.fill('input[name="startDate"]', '2024-01-01');
      await page.fill('input[name="endDate"]', '2024-03-01');
      
      // Add goals
      await page.fill('input[name="goal1"]', 'Reduce pain levels from 7/10 to 3/10');
      await page.fill('input[name="goal2"]', 'Improve lumbar spine flexibility by 50%');
      
      // Submit treatment plan
      await page.click('button:has-text("Create Treatment Plan")');
      
      // Verify success
      await expect(page.getByText('Treatment plan created successfully')).toBeVisible();
    });

    test('should update treatment plan status', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Go to treatment plans tab
      await page.click('button[data-value="treatment"]');
      
      // Update status of existing plan
      await page.click('button[aria-label="Update treatment plan status"]:first-of-type');
      await page.selectOption('select[name="status"]', 'completed');
      await page.click('button:has-text("Update Status")');
      
      // Verify update
      await expect(page.getByText('Treatment plan status updated')).toBeVisible();
    });
  });

  test.describe('Medical Information', () => {
    test('should view patient medical information', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Go to medical info tab
      await page.click('button[data-value="medical"]');
      
      // Should display medical history sections
      await expect(page.getByText('Medical History')).toBeVisible();
      await expect(page.getByText('Current Medications')).toBeVisible();
      await expect(page.getByText('Allergies')).toBeVisible();
      await expect(page.getByText('Emergency Contact')).toBeVisible();
    });

    test('should update emergency contact', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Go to medical info tab and edit emergency contact
      await page.click('button[data-value="medical"]');
      await page.click('button:has-text("Edit Emergency Contact")');
      
      // Update contact information
      await page.fill('input[name="emergencyContactName"]', 'Jane Smith');
      await page.fill('input[name="emergencyContactPhone"]', '+2341234567890');
      await page.fill('input[name="emergencyContactRelationship"]', 'Spouse');
      
      await page.click('button:has-text("Update Contact")');
      
      // Verify update
      await expect(page.getByText('Emergency contact updated successfully')).toBeVisible();
    });
  });

  test.describe('Patient Communication', () => {
    test('should send message to patient', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Click message patient button
      await page.click('button:has-text("Message Patient")');
      
      // Fill message form
      await page.fill('input[name="subject"]', 'Appointment Reminder');
      await page.fill('textarea[name="message"]', 'Don\'t forget about your appointment tomorrow at 10:00 AM');
      
      await page.click('button:has-text("Send Message")');
      
      // Verify message sent
      await expect(page.getByText('Message sent successfully')).toBeVisible();
    });
  });

  test.describe('Patient Data Export', () => {
    test('should export patient data', async ({ page }) => {
      await page.click('a[href="/dashboard/physiotherapist/patients"]');
      await page.click('tbody tr:first-child a');
      
      // Click export data button
      await page.click('button:has-text("Export Data")');
      
      // Select export options
      await page.check('input[name="includeAppointments"]');
      await page.check('input[name="includeSessionLogs"]');
      await page.check('input[name="includeTreatmentPlans"]');
      
      // Start export
      await page.click('button:has-text("Generate Export")');
      
      // Verify export initiated
      await expect(page.getByText('Export started. You will receive an email when ready.')).toBeVisible();
    });
  });
}); 