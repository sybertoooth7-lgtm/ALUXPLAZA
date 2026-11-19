import { expect, test, type Page } from '@playwright/test';

// These tests mock the API at the network layer. They verify what the frontend
// does with each kind of response; they do not verify backend authentication,
// MFA or database behavior (the backend test suite covers those).

async function mockCsrf(page: Page) {
  await page.route('**/api/csrf-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ csrfToken: 'test-csrf-token' }),
    });
  });
}

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

test.describe('Client signup', () => {
  test('is blocked client-side until the privacy consent box is ticked', async ({ page }) => {
    let signupRequests = 0;
    await mockCsrf(page);
    await page.route('**/api/client/signup', async (route) => {
      signupRequests += 1;
      await route.fulfill(json({ message: 'should not be reached' }, 201));
    });

    await page.goto('/client/signup');
    await page.getByLabel('Company Name', { exact: true }).fill('Acme Ltd');
    await page.getByLabel('Email', { exact: true }).fill('owner@acme.example');
    await page.getByLabel('Password', { exact: true }).fill('a-long-enough-passphrase-1');

    // The checkbox carries the native `required` attribute, so the browser
    // stops the submit before the app's own handler runs. Assert on that
    // behavior rather than on an in-page error message.
    const consent = page.getByRole('checkbox', { name: /agree.*privacy policy/i });
    await page.getByRole('button', { name: /create account/i }).click();

    expect(await consent.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
    await expect(page).toHaveURL(/\/client\/signup$/);
    expect(signupRequests).toBe(0);
  });

  test('sends the consent flag, shows the success message, and links on to sign in', async ({
    page,
  }) => {
    let payload: Record<string, unknown> | null = null;
    await mockCsrf(page);
    await page.route('**/api/client/signup', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill(json({ message: 'Account created. Check your inbox to verify.' }, 201));
    });

    await page.goto('/client/signup');
    await page.getByLabel('Company Name', { exact: true }).fill('Acme Ltd');
    await page.getByLabel('Email', { exact: true }).fill('owner@acme.example');
    await page.getByLabel('Password', { exact: true }).fill('a-long-enough-passphrase-1');
    await page.getByRole('checkbox', { name: /agree.*privacy policy/i }).check();
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText('Account created. Check your inbox to verify.')).toBeVisible();
    expect(payload).toMatchObject({
      companyName: 'Acme Ltd',
      email: 'owner@acme.example',
      consent: true,
    });

    await page.getByRole('button', { name: /go to sign in/i }).click();
    await expect(page).toHaveURL(/\/client\/login$/);
  });

  test('shows the server error when signup is rejected', async ({ page }) => {
    await mockCsrf(page);
    await page.route('**/api/client/signup', async (route) => {
      await route.fulfill(json({ error: 'Unable to create account' }, 409));
    });

    await page.goto('/client/signup');
    await page.getByLabel('Company Name', { exact: true }).fill('Acme Ltd');
    await page.getByLabel('Email', { exact: true }).fill('owner@acme.example');
    await page.getByLabel('Password', { exact: true }).fill('a-long-enough-passphrase-1');
    await page.getByRole('checkbox', { name: /agree.*privacy policy/i }).check();
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText('Unable to create account')).toBeVisible();
  });
});

test.describe('Password reset request', () => {
  test('submit stays disabled until the email looks valid', async ({ page }) => {
    await page.goto('/client/forgot-password');

    const submit = page.getByRole('button', { name: /send reset link/i });
    await expect(submit).toBeDisabled();

    await page.getByLabel('Email address').fill('not-an-email');
    await expect(submit).toBeDisabled();

    await page.getByLabel('Email address').fill('owner@acme.example');
    await expect(submit).toBeEnabled();
  });

  test('shows the neutral confirmation and locks the form after a request', async ({ page }) => {
    let payload: Record<string, unknown> | null = null;
    await mockCsrf(page);
    await page.route('**/api/client/password-reset/request', async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill(json({ message: 'If this account exists, a reset link has been sent.' }));
    });

    await page.goto('/client/forgot-password');
    await page.getByLabel('Email address').fill('owner@acme.example');
    await page.getByRole('button', { name: /send reset link/i }).click();

    await expect(page.getByRole('status')).toContainText(/if this account exists/i);
    expect(payload).toMatchObject({ email: 'owner@acme.example' });
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeDisabled();
  });

  test('has a working link back to login', async ({ page }) => {
    await page.goto('/client/forgot-password');
    await page.getByRole('link', { name: /back to login/i }).click();
    await expect(page).toHaveURL(/\/client\/login$/);
  });
});

test.describe('Admin login', () => {
  // AdminLogin's <label> elements are not associated with their inputs, so
  // getByLabel cannot be used here; inputs are located by type instead.
  async function fillAdminLogin(page: Page, email: string, password: string) {
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
  }

  test('renders the admin login form', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: /admin login/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('shows the server error for bad credentials and stays on the page', async ({ page }) => {
    await mockCsrf(page);
    await page.route('**/api/admin/login', async (route) => {
      await route.fulfill(json({ error: 'Invalid credentials' }, 401));
    });

    await page.goto('/admin/login');
    await fillAdminLogin(page, 'admin@alux.example', 'wrong-password');

    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('opens the MFA modal, and cancelling closes it with a message', async ({ page }) => {
    await mockCsrf(page);
    await page.route('**/api/admin/login', async (route) => {
      await route.fulfill(json({ mfaRequired: true, mfaToken: 'short-lived-token' }));
    });

    await page.goto('/admin/login');
    await fillAdminLogin(page, 'admin@alux.example', 'correct-password-123');

    await expect(page.getByRole('heading', { name: /two-factor authentication/i })).toBeVisible();
    await page.getByRole('button', { name: /^cancel$/i }).click();

    await expect(page.getByRole('heading', { name: /two-factor authentication/i })).toBeHidden();
    await expect(page.getByText('MFA verification cancelled.')).toBeVisible();
  });

  test('MFA modal only accepts digits, caps at 6, and enables Verify at exactly 6', async ({
    page,
  }) => {
    await mockCsrf(page);
    await page.route('**/api/admin/login', async (route) => {
      await route.fulfill(json({ mfaRequired: true, mfaToken: 'short-lived-token' }));
    });

    await page.goto('/admin/login');
    await fillAdminLogin(page, 'admin@alux.example', 'correct-password-123');

    const code = page.getByPlaceholder('000000');
    const verify = page.getByRole('button', { name: /^verify$/i });
    await expect(verify).toBeDisabled();

    await code.fill('12ab34');
    await expect(code).toHaveValue('1234');
    await expect(verify).toBeDisabled();

    await code.fill('123456789');
    await expect(code).toHaveValue('123456');
    await expect(verify).toBeEnabled();
  });

  test('shows the server error for a wrong MFA code and keeps the modal open', async ({ page }) => {
    let verifyPayload: Record<string, unknown> | null = null;
    await mockCsrf(page);
    await page.route('**/api/admin/login', async (route) => {
      await route.fulfill(json({ mfaRequired: true, mfaToken: 'short-lived-token' }));
    });
    await page.route('**/api/admin/mfa/verify', async (route) => {
      verifyPayload = route.request().postDataJSON();
      await route.fulfill(json({ error: 'Invalid code' }, 401));
    });

    await page.goto('/admin/login');
    await fillAdminLogin(page, 'admin@alux.example', 'correct-password-123');
    await page.getByPlaceholder('000000').fill('000000');
    await page.getByRole('button', { name: /^verify$/i }).click();

    await expect(page.getByText('Invalid code')).toBeVisible();
    await expect(page.getByRole('heading', { name: /two-factor authentication/i })).toBeVisible();
    expect(verifyPayload).toMatchObject({ mfaToken: 'short-lived-token', code: '000000' });
  });

  test('sends an admin who still has to enroll in MFA to the setup page', async ({ page }) => {
    await mockCsrf(page);
    await page.route('**/api/admin/login', async (route) => {
      await route.fulfill(json({ mfaEnrollmentRequired: true }));
    });

    await page.goto('/admin/login');
    await fillAdminLogin(page, 'admin@alux.example', 'correct-password-123');

    await expect(page).toHaveURL(/\/admin\/mfa-setup$/);
  });
});
