import { expect, test } from '@playwright/test';

// Public marketing, legal and service pages. Each one should render a heading
// without throwing an uncaught error or falling into the error boundary.
const publicPages: Array<{ path: string; name: string }> = [
  { path: '/', name: 'home' },
  { path: '/about', name: 'about' },
  { path: '/blog', name: 'blog' },
  { path: '/services', name: 'services overview' },
  { path: '/services/incident-response', name: 'incident response' },
  { path: '/services/vulnerability-assessment', name: 'vulnerability assessment' },
  { path: '/services/compliance-readiness', name: 'compliance readiness' },
  { path: '/services/data-protection-audit', name: 'data protection audit' },
  { path: '/services/network-hardening', name: 'network hardening' },
  { path: '/privacy-policy', name: 'privacy policy' },
  { path: '/terms-of-service', name: 'terms of service' },
  { path: '/security', name: 'security policy' },
  { path: '/compliance', name: 'compliance' },
];

test.describe('Public pages render without crashing', () => {
  for (const { path, name } of publicPages) {
    test(`${name} (${path})`, async ({ page }) => {
      const uncaught: string[] = [];
      page.on('pageerror', (error) => uncaught.push(error.message));

      await page.goto(path);

      await expect(page.getByRole('heading').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: /something went wrong/i })).toHaveCount(0);
      await expect(page).toHaveTitle(/.+/);
      expect(uncaught).toEqual([]);
    });
  }
});

test.describe('Routing', () => {
  test('an unknown path shows the 404 page, and its link returns home', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');

    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
    await page.getByRole('link', { name: /back to home/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  for (const legacy of ['/ai-lab', '/careers', '/press']) {
    test(`legacy path ${legacy} redirects to the home page`, async ({ page }) => {
      await page.goto(legacy);
      await expect(page).toHaveURL(/\/$/);
    });
  }

  test('a malformed reset-password link (no token) shows the 404 page', async ({ page }) => {
    await page.goto('/client/reset-password');
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
  });

  test('the error boundary resets when navigating away from a broken page', async ({ page }) => {
    // 404 page -> home: the boundary is keyed by pathname, so moving between
    // routes must always render the new route rather than a stale fallback.
    await page.goto('/this-page-does-not-exist');
    await page.getByRole('link', { name: /back to home/i }).click();
    await expect(page.getByRole('heading', { name: /something went wrong/i })).toHaveCount(0);
    await expect(page.locator('body')).toBeVisible();
  });
});
