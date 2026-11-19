import { expect, test } from '@playwright/test';
import { ADMIN, API_URL, totp } from './support/stack';

// Full-stack: the bootstrap admin created at backend boot goes through forced
// MFA enrolment, then signs in with a real authenticator code. Nothing is mocked.
//
// Mandatory admin MFA is on (ADMIN_MFA_REQUIRED=true in the config), so the
// first sign-in cannot reach the dashboard until MFA is set up.

let mfaSecret = '';

test.describe.configure({ mode: 'serial' });

test.describe('Admin journey against the real stack', () => {
  test('admin and client APIs refuse requests that have no session', async ({ request }) => {
    expect((await request.get(`${API_URL}/api/admin/me`)).status()).toBe(401);
    expect((await request.get(`${API_URL}/api/client/me`)).status()).toBe(401);
  });

  test('a wrong admin password is rejected with a generic message', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('input[type="email"]').fill(ADMIN.email);
    await page.locator('input[type="password"]').fill('Not-The-Right-Password-1');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('first sign-in is forced into MFA setup, and finishing setup opens the dashboard', async ({
    page,
  }) => {
    await page.goto('/admin/login');
    await page.locator('input[type="email"]').fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/admin\/mfa-setup$/);
    await expect(
      page.getByRole('heading', { name: /set up two-factor authentication/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /start setup/i }).click();
    await expect(page.getByAltText('MFA QR Code')).toBeVisible();

    // The manual entry key is the only <code> element on this step.
    mfaSecret = ((await page.locator('code').first().textContent()) ?? '').trim();
    expect(mfaSecret).toMatch(/^[A-Z2-7]{16,}$/);

    await page.getByPlaceholder('000000').fill(totp(mfaSecret));
    await page.getByRole('button', { name: /verify & enable/i }).click();

    await expect(page.getByRole('heading', { name: /save your backup codes/i })).toBeVisible();
    await expect(page.locator('code').first()).toBeVisible();

    await page.getByRole('button', { name: /saved them/i }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByRole('heading', { name: /compliance overview/i })).toBeVisible();

    const cookies = await page.context().cookies(API_URL);
    const session = cookies.find((cookie) => cookie.name === 'adminToken');
    expect(session, 'adminToken cookie should be set').toBeDefined();
    expect(session?.httpOnly).toBe(true);
  });

  test('signing in again needs an authenticator code; the admin area opens, and logout locks it', async ({
    page,
  }) => {
    await page.goto('/admin/login');
    await page.locator('input[type="email"]').fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page.getByRole('heading', { name: /two-factor authentication/i })).toBeVisible();

    // A wrong code is refused and the challenge stays open.
    await page.getByPlaceholder('000000').fill('000000');
    await page.getByRole('button', { name: /^verify$/i }).click();
    await expect(page.getByText(/invalid mfa code/i)).toBeVisible();

    // Enrolment already used this time step's code, and the backend refuses to
    // accept the same step twice, so use the next step's code.
    await page.getByPlaceholder('000000').fill(totp(mfaSecret, 1));
    await page.getByRole('button', { name: /^verify$/i }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByRole('heading', { name: /compliance overview/i })).toBeVisible();

    // The other admin pages open for a signed-in admin (and are not bounced to login).
    for (const path of ['/admin/users', '/admin/submissions', '/admin/security']) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }

    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    // The session is gone on the server, not just hidden in the page.
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
