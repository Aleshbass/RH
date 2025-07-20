import { test, expect } from '@playwright/test';
import { Page } from '@playwright/test';

test.describe('Authentication & Authorization Flow', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('Sign Up Flow', () => {
    test('should complete physiotherapist sign up', async () => {
      await page.goto('/sign-up');
      
      // Fill sign up form
      await page.fill('input[name="firstName"]', 'New');
      await page.fill('input[name="lastName"]', 'Physiotherapist');
      await page.fill('input[type="email"]', 'new.physio@example.com');
      await page.fill('input[type="password"]', 'SecurePassword123!');
      await page.fill('input[name="confirmPassword"]', 'SecurePassword123!');
      
      await page.click('button[type="submit"]');
      
      // Should redirect to role selection
      await page.waitForURL('/role-selection');
      
      // Select physiotherapist role
      await page.click('button[data-role="physiotherapist"]');
      
      // Should redirect to physiotherapist onboarding
      await page.waitForURL('/physiotherapist/step1');
      
      // Complete onboarding steps
      await page.fill('input[name="licenseNumber"]', 'PT123456');
      await page.fill('input[name="yearsOfExperience"]', '5');
      await page.selectOption('select[name="specialization"]', 'sports_rehabilitation');
      
      await page.click('button:has-text("Next")');
      
      // Step 2 - Professional details
      await page.fill('textarea[name="bio"]', 'Experienced physiotherapist specializing in sports injuries');
      await page.fill('input[name="education"]', 'Masters in Physiotherapy');
      
      await page.click('button:has-text("Next")');
      
      // Step 3 - Verification documents
      await page.setInputFiles('input[type="file"][name="licenseDocument"]', 'tests/fixtures/sample-license.pdf');
      
      await page.click('button:has-text("Complete Registration")');
      
      // Should redirect to pending approval page
      await page.waitForURL('/pending-approval');
      await expect(page.getByText('Application Submitted')).toBeVisible();
    });

    test('should validate password requirements', async () => {
      await page.goto('/sign-up');
      
      await page.fill('input[name="firstName"]', 'Test');
      await page.fill('input[name="lastName"]', 'User');
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'weak');
      
      await page.click('button[type="submit"]');
      
      // Should show password validation errors
      await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
      await expect(page.getByText('Password must contain uppercase letter')).toBeVisible();
      await expect(page.getByText('Password must contain number')).toBeVisible();
    });

    test('should prevent duplicate email registration', async () => {
      await page.goto('/sign-up');
      
      // Try to register with existing email
      await page.fill('input[name="firstName"]', 'Test');
      await page.fill('input[name="lastName"]', 'User');
      await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
      await page.fill('input[type="password"]', 'SecurePassword123!');
      
      await page.click('button[type="submit"]');
      
      await expect(page.getByText('Email already registered')).toBeVisible();
    });
  });

  test.describe('Sign In Flow', () => {
    test('should sign in with valid credentials', async () => {
      await page.goto('/sign-in');
      
      await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
      await page.fill('input[type="password"]', 'testpassword123');
      
      await page.click('button[type="submit"]');
      
      // Should redirect to dashboard
      await page.waitForURL('/dashboard/physiotherapist');
      await expect(page.getByText('Welcome back')).toBeVisible();
    });

    test('should reject invalid credentials', async () => {
      await page.goto('/sign-in');
      
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      
      await page.click('button[type="submit"]');
      
      await expect(page.getByText('Invalid email or password')).toBeVisible();
    });

    test('should handle account not found', async () => {
      await page.goto('/sign-in');
      
      await page.fill('input[type="email"]', 'nonexistent@example.com');
      await page.fill('input[type="password"]', 'password123');
      
      await page.click('button[type="submit"]');
      
      await expect(page.getByText('Account not found')).toBeVisible();
    });
  });

  test.describe('Role-Based Access Control', () => {
    test('physiotherapist should access only authorized pages', async () => {
      // Sign in as physiotherapist
      await page.goto('/sign-in');
      await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
      await page.fill('input[type="password"]', 'testpassword123');
      await page.click('button[type="submit"]');
      
      // Should access physiotherapist dashboard
      await page.goto('/dashboard/physiotherapist');
      await expect(page.getByText('Welcome back')).toBeVisible();
      
      // Should access patient management
      await page.goto('/dashboard/physiotherapist/patients');
      await expect(page.locator('table')).toBeVisible();
      
      // Should NOT access admin pages
      await page.goto('/dashboard/admin');
      await expect(page).toHaveURL('/dashboard/physiotherapist');
      
      // Should NOT access clinic owner pages
      await page.goto('/dashboard/clinic');
      await expect(page).toHaveURL('/dashboard/physiotherapist');
    });

    test('should redirect unauthenticated users', async () => {
      // Try to access protected page without authentication
      await page.goto('/dashboard/physiotherapist');
      
      // Should redirect to sign in
      await page.waitForURL('/sign-in');
      await expect(page.getByText('Sign in to your account')).toBeVisible();
    });

    test('should handle session expiration', async () => {
      // Sign in
      await page.goto('/sign-in');
      await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
      await page.fill('input[type="password"]', 'testpassword123');
      await page.click('button[type="submit"]');
      
      // Clear session storage to simulate expiration
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
      await page.evaluate(() => sessionStorage.clear());
      
      // Try to access protected page
      await page.goto('/dashboard/physiotherapist/patients');
      
      // Should redirect to sign in
      await page.waitForURL('/sign-in');
      await expect(page.getByText('Session expired')).toBeVisible();
    });
  });

  test.describe('Account Approval Flow', () => {
    test('should handle pending approval state', async () => {
      // Create account that needs approval (simulate new signup)
      await page.goto('/sign-up');
      // ... complete signup process as shown above
      
      // After signup, should be in pending state
      await page.waitForURL('/pending-approval');
      
      // Try to access dashboard
      await page.goto('/dashboard/physiotherapist');
      
      // Should redirect back to pending approval
      await page.waitForURL('/pending-approval');
      await expect(page.getByText('Your account is pending approval')).toBeVisible();
    });

    test('admin should approve pending accounts', async () => {
      // Sign in as admin
      await page.goto('/sign-in');
      await page.fill('input[type="email"]', 'admin@rehabify.health');
      await page.fill('input[type="password"]', 'adminpassword123');
      await page.click('button[type="submit"]');
      
      // Go to approval queue
      await page.goto('/dashboard/admin/approvals');
      
      // Approve pending account
      await page.click('button[data-action="approve"]:first-of-type');
      await page.fill('textarea[name="approvalNotes"]', 'License verified and approved');
      await page.click('button:has-text("Approve Account")');
      
      await expect(page.getByText('Account approved successfully')).toBeVisible();
    });
  });

  test.describe('Password Management', () => {
    test('should reset password via email', async () => {
      await page.goto('/sign-in');
      
      // Click forgot password
      await page.click('a:has-text("Forgot password?")');
      
      // Enter email
      await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
      await page.click('button:has-text("Send Reset Link")');
      
      await expect(page.getByText('Password reset link sent')).toBeVisible();
      
      // Simulate clicking reset link (would normally come via email)
      await page.goto('/reset-password?token=test-reset-token');
      
      // Set new password
      await page.fill('input[name="newPassword"]', 'NewSecurePassword123!');
      await page.fill('input[name="confirmPassword"]', 'NewSecurePassword123!');
      await page.click('button:has-text("Reset Password")');
      
      await expect(page.getByText('Password reset successfully')).toBeVisible();
      
      // Should redirect to sign in
      await page.waitForURL('/sign-in');
    });

    test('should change password from settings', async () => {
      // Sign in
      await page.goto('/sign-in');
      await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
      await page.fill('input[type="password"]', 'testpassword123');
      await page.click('button[type="submit"]');
      
      // Go to settings
      await page.goto('/dashboard/physiotherapist/settings');
      
      // Change password
      await page.click('button:has-text("Change Password")');
      await page.fill('input[name="currentPassword"]', 'testpassword123');
      await page.fill('input[name="newPassword"]', 'UpdatedPassword123!');
      await page.fill('input[name="confirmPassword"]', 'UpdatedPassword123!');
      
      await page.click('button:has-text("Update Password")');
      
      await expect(page.getByText('Password updated successfully')).toBeVisible();
    });
  });

  test.describe('Two-Factor Authentication', () => {
    test('should enable 2FA', async () => {
      // Sign in
      await page.goto('/sign-in');
      await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
      await page.fill('input[type="password"]', 'testpassword123');
      await page.click('button[type="submit"]');
      
      // Go to security settings
      await page.goto('/dashboard/physiotherapist/settings');
      await page.click('a:has-text("Security")');
      
      // Enable 2FA
      await page.click('button:has-text("Enable 2FA")');
      
      // Should show QR code
      await expect(page.locator('canvas, img[alt*="QR"]')).toBeVisible();
      
      // Enter verification code (mock)
      await page.fill('input[name="verificationCode"]', '123456');
      await page.click('button:has-text("Verify and Enable")');
      
      await expect(page.getByText('2FA enabled successfully')).toBeVisible();
    });

    test('should require 2FA code on login', async () => {
      // Assuming 2FA is enabled, sign in
      await page.goto('/sign-in');
      await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
      await page.fill('input[type="password"]', 'testpassword123');
      await page.click('button[type="submit"]');
      
      // Should prompt for 2FA code
      await expect(page.getByText('Enter verification code')).toBeVisible();
      
      // Enter 2FA code
      await page.fill('input[name="twoFactorCode"]', '123456');
      await page.click('button:has-text("Verify")');
      
      // Should complete login
      await page.waitForURL('/dashboard/physiotherapist');
    });
  });

  test.describe('Account Deactivation', () => {
    test('should deactivate account', async () => {
      // Sign in
      await page.goto('/sign-in');
      await page.fill('input[type="email"]', 'test.physiotherapist@rehabify.health');
      await page.fill('input[type="password"]', 'testpassword123');
      await page.click('button[type="submit"]');
      
      // Go to account settings
      await page.goto('/dashboard/physiotherapist/settings');
      await page.click('a:has-text("Account")');
      
      // Deactivate account
      await page.click('button:has-text("Deactivate Account")');
      
      // Confirm deactivation
      await page.fill('input[name="confirmPassword"]', 'testpassword123');
      await page.fill('textarea[name="reason"]', 'No longer practicing');
      await page.click('button:has-text("Confirm Deactivation")');
      
      await expect(page.getByText('Account deactivated successfully')).toBeVisible();
      
      // Should redirect to homepage
      await page.waitForURL('/');
    });

    test('should prevent login to deactivated account', async () => {
      await page.goto('/sign-in');
      
      // Try to sign in with deactivated account
      await page.fill('input[type="email"]', 'deactivated@example.com');
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
      
      await expect(page.getByText('Account has been deactivated')).toBeVisible();
    });
  });
}); 