import { test, expect } from '@playwright/test';

test.describe('Basic UI Tests', () => {
  test('should load the landing page', async ({ page }) => {
    await page.goto('/');
    
    // Check if the page loads
    await expect(page).toHaveTitle(/Rehabify/);
    
    // Check for basic elements
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    
    // Check for navigation
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('should navigate to sign in page', async ({ page }) => {
    await page.goto('/');
    
    // Look for sign in link/button
    const signInButton = page.getByRole('link', { name: /sign in/i }).first();
    if (await signInButton.isVisible()) {
      await signInButton.click();
      await expect(page).toHaveURL(/sign-in/);
    } else {
      // Try to navigate directly
      await page.goto('/sign-in');
      await expect(page).toHaveURL(/sign-in/);
    }
  });

  test('should load sign up page', async ({ page }) => {
    await page.goto('/sign-up');
    
    // Check if the sign up page loads
    await expect(page).toHaveURL(/sign-up/);
    
    // Should have form elements
    await expect(page.getByRole('textbox')).toBeVisible();
  });

  test('should have responsive navigation', async ({ page }) => {
    await page.goto('/');
    
    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Navigation should still be present (might be hamburger menu)
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible();
  });
}); 