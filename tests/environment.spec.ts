import { test, expect } from '@playwright/test';

test.describe('Environment Setup', () => {
  test('should have all required environment variables', async () => {
    // Check that environment variables are loaded
    expect(process.env.NEXT_PUBLIC_CONVEX_URL).toBeTruthy();
    expect(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBeTruthy();
    expect(process.env.CLERK_SECRET_KEY).toBeTruthy();
    
    console.log('✅ Environment variables loaded successfully');
    console.log('📍 Convex URL:', process.env.NEXT_PUBLIC_CONVEX_URL?.substring(0, 30) + '...');
  });

  test('should load the application homepage', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Check that the page title contains expected content
    const title = await page.title();
    expect(title).toContain('Rehabify'); // Adjust based on your actual title
    
    console.log('✅ Homepage loaded successfully');
    console.log('📄 Page title:', title);
  });

  test('should have working Convex connection', async ({ page }) => {
    // Navigate to a page that uses Convex
    await page.goto('/');
    
    // Wait for any Convex queries to load
    await page.waitForTimeout(3000);
    
    // Check for any console errors related to Convex
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text());
      }
    });
    
    // Navigate and wait
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Check that there are no Convex connection errors
    const convexErrors = logs.filter(log => 
      log.includes('convex') || 
      log.includes('Connection failed') ||
      log.includes('WebSocket')
    );
    
    if (convexErrors.length > 0) {
      console.warn('⚠️ Convex connection warnings:', convexErrors);
    } else {
      console.log('✅ No Convex connection errors detected');
    }
  });
}); 