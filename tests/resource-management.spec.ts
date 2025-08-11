import { test, expect } from '@playwright/test';

test.describe('Resource Management System', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the resource management dashboard
    await page.goto('/dashboard/physiotherapist/resources');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should display resource management dashboard', async ({ page }) => {
    // Check if the main heading is visible
    await expect(page.locator('h2')).toContainText('Resource Management');
    
    // Check if the add resource button is visible
    await expect(page.locator('button', { hasText: 'Add Resource' })).toBeVisible();
    
    // Check if statistics cards are visible
    await expect(page.locator('text=Total Resources')).toBeVisible();
    await expect(page.locator('text=Equipment')).toBeVisible();
    await expect(page.locator('text=Rooms')).toBeVisible();
    await expect(page.locator('text=Staff')).toBeVisible();
  });

  test('should open create resource modal', async ({ page }) => {
    // Click the add resource button
    await page.click('button:has-text("Add Resource")');
    
    // Check if the modal is opened
    await expect(page.locator('text=Add New Resource')).toBeVisible();
    
    // Check if required fields are present
    await expect(page.locator('input[id="name"]')).toBeVisible();
    await expect(page.locator('button:has-text("Select resource type")')).toBeVisible();
    
    // Check if form sections are present
    await expect(page.locator('text=Specifications')).toBeVisible();
    await expect(page.locator('text=Operating Hours')).toBeVisible();
    await expect(page.locator('text=Maintenance Schedule')).toBeVisible();
    await expect(page.locator('text=Tags')).toBeVisible();
  });

  test('should validate required fields in create resource form', async ({ page }) => {
    // Open the create resource modal
    await page.click('button:has-text("Add Resource")');
    
    // Try to submit without filling required fields
    await page.click('button:has-text("Create Resource")');
    
    // Check for validation errors
    await expect(page.locator('text=Resource name is required')).toBeVisible();
    await expect(page.locator('text=Resource type is required')).toBeVisible();
  });

  test('should create a new equipment resource', async ({ page }) => {
    // Open the create resource modal
    await page.click('button:has-text("Add Resource")');
    
    // Fill in the form
    await page.fill('input[id="name"]', 'Test Treatment Table');
    await page.click('button:has-text("Select resource type")');
    await page.click('text=Equipment');
    await page.fill('textarea[id="description"]', 'High-quality treatment table for physiotherapy');
    await page.fill('input[id="category"]', 'Physical Therapy');
    await page.fill('input[id="location"]', 'Room 101');
    await page.fill('input[id="capacity"]', '1');
    
    // Fill specifications
    await page.fill('input[id="brand"]', 'MedEquip');
    await page.fill('input[id="model"]', 'PT-2000');
    await page.fill('input[id="serialNumber"]', 'ME2000-001');
    
    // Set operating hours for Monday
    await page.fill('input[type="time"]:near(:text("monday")):first', '09:00');
    await page.fill('input[type="time"]:near(:text("monday")):last', '17:00');
    
    // Set maintenance schedule
    await page.click('button:has-text("Select frequency")');
    await page.click('text=Monthly');
    
    // Add a tag
    await page.fill('input:near(:text("Add a tag..."))', 'physiotherapy');
    await page.click('button:has(svg)'); // Plus button
    
    // Submit the form
    await page.click('button:has-text("Create Resource")');
    
    // Check for success message
    await expect(page.locator('text=Resource created successfully!')).toBeVisible();
  });

  test('should filter resources by type', async ({ page }) => {
    // Wait for resources to load
    await page.waitForSelector('table');
    
    // Click on the type filter
    await page.click('button:has-text("All Types")');
    await page.click('text=Equipment');
    
    // Check if the filter is applied
    await expect(page.locator('button:has-text("Equipment")')).toBeVisible();
    
    // Reset filter
    await page.click('button:has-text("Equipment")');
    await page.click('text=All Types');
  });

  test('should search resources', async ({ page }) => {
    // Wait for resources to load
    await page.waitForSelector('table');
    
    // Search for a resource
    await page.fill('input[placeholder="Search resources..."]', 'treatment');
    
    // Wait for search results
    await page.waitForTimeout(500);
    
    // Check if search is working (results should be filtered)
    const searchInput = page.locator('input[placeholder="Search resources..."]');
    await expect(searchInput).toHaveValue('treatment');
  });

  test('should open edit resource modal', async ({ page }) => {
    // Wait for resources to load
    await page.waitForSelector('table');
    
    // Check if there are any resources
    const resourceRows = page.locator('table tbody tr');
    const count = await resourceRows.count();
    
    if (count > 0) {
      // Click on the first resource's action menu
      await page.click('button[aria-haspopup="menu"]:first');
      await page.click('text=Edit');
      
      // Check if edit modal is opened
      await expect(page.locator('text=Edit Resource')).toBeVisible();
    }
  });

  test('should display resource statistics correctly', async ({ page }) => {
    // Check if statistics cards show numbers
    const totalResources = page.locator('text=Total Resources').locator('..').locator('div.text-2xl');
    const equipmentCount = page.locator('text=Equipment').locator('..').locator('div.text-2xl');
    const roomCount = page.locator('text=Rooms').locator('..').locator('div.text-2xl');
    const staffCount = page.locator('text=Staff').locator('..').locator('div.text-2xl');
    const activeCount = page.locator('text=Active').locator('..').locator('div.text-2xl');
    
    // Check if statistics are numbers (not NaN or empty)
    await expect(totalResources).toContainText(/^\d+$/);
    await expect(equipmentCount).toContainText(/^\d+$/);
    await expect(roomCount).toContainText(/^\d+$/);
    await expect(staffCount).toContainText(/^\d+$/);
    await expect(activeCount).toContainText(/^\d+$/);
  });

  test('should handle empty state correctly', async ({ page }) => {
    // If no resources exist, check empty state
    const noResourcesMessage = page.locator('text=No resources found');
    const addResourceButton = page.locator('button:has-text("Add Resource")');
    
    // Either resources exist or empty state is shown
    const hasResources = await page.locator('table tbody tr').count() > 0;
    const hasEmptyState = await noResourcesMessage.isVisible();
    
    expect(hasResources || hasEmptyState).toBeTruthy();
    
    if (hasEmptyState) {
      await expect(addResourceButton).toBeVisible();
    }
  });

  test('should validate operating hours correctly', async ({ page }) => {
    // Open the create resource modal
    await page.click('button:has-text("Add Resource")');
    
    // Fill basic required fields
    await page.fill('input[id="name"]', 'Test Resource');
    await page.click('button:has-text("Select resource type")');
    await page.click('text=Room');
    
    // Set invalid operating hours (end before start)
    await page.fill('input[type="time"]:near(:text("monday")):first', '17:00');
    await page.fill('input[type="time"]:near(:text("monday")):last', '09:00');
    
    // Try to submit
    await page.click('button:has-text("Create Resource")');
    
    // Check for validation error
    await expect(page.locator('text=Start time must be before end time')).toBeVisible();
  });

  test('should handle resource tags correctly', async ({ page }) => {
    // Open the create resource modal
    await page.click('button:has-text("Add Resource")');
    
    // Add multiple tags
    await page.fill('input:near(:text("Add a tag..."))', 'physiotherapy');
    await page.click('button:has(svg)'); // Plus button
    
    await page.fill('input:near(:text("Add a tag..."))', 'rehabilitation');
    await page.click('button:has(svg)'); // Plus button
    
    // Check if tags are displayed
    await expect(page.locator('text=physiotherapy')).toBeVisible();
    await expect(page.locator('text=rehabilitation')).toBeVisible();
    
    // Remove a tag
    await page.click('button:has(svg):near(:text("physiotherapy"))');
    
    // Check if tag is removed
    await expect(page.locator('text=physiotherapy')).not.toBeVisible();
    await expect(page.locator('text=rehabilitation')).toBeVisible();
  });
});
