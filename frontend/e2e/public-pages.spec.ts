import { expect, test } from '@playwright/test';

test.describe('Alux Plaza public client journeys', () => {
  test('home page loads and has a document title', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(/.+/);
  });

  test('client login route renders the login form', async ({ page }) => {
    await page.goto('/client/login');

    await expect(page.getByRole('heading', { name: /alux plaza/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /create account/i })).toHaveAttribute(
      'href',
      '/client/signup',
    );
  });

  test('client signup route renders required account fields and privacy consent', async ({ page }) => {
    await page.goto('/client/signup');

    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();
    await expect(page.getByLabel(/company name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByLabel(/agree.*privacy policy/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('invalid login input is rejected client-side without sending credentials', async ({ page }) => {
    let loginRequests = 0;
    await page.route('**/api/client/login', async (route) => {
      loginRequests += 1;
      await route.fulfill({ status: 500, body: '{}' });
    });

    await page.goto('/client/login');
    await page.getByLabel(/email/i).fill('not-an-email');
    await page.getByLabel(/password/i).fill('anything');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('alert')).toContainText(/valid email/i);
    expect(loginRequests).toBe(0);
  });

  test('client dashboard redirects to login when the session is missing', async ({ page }) => {
    await page.route('**/api/client/me', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      });
    });

    await page.goto('/client/dashboard');
    await expect(page).toHaveURL(/\/client\/login$/);
  });

  test('client dashboard treats a deleted client session as signed out', async ({ page }) => {
    await page.route('**/api/client/me', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Client not found' }),
      });
    });

    await page.goto('/client/dashboard');
    await expect(page).toHaveURL(/\/client\/login$/);
  });
});
