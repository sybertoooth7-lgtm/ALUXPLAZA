import { expect, test } from '@playwright/test';
import { API_URL, backendLogSize, waitForEmailLink } from './support/stack';

// Full-stack: nothing here is mocked. Each step talks to the real backend and
// PostgreSQL, and the emailed links are read from the backend's own log.
//
// The tests share one account and must run in order (they build on each other),
// so the suite is serial. Each test still gets a fresh browser context, which
// means every test that needs a session signs in for itself.

const runId = Date.now().toString(36);
const companyName = `E2E Client ${runId}`;
const email = `client-${runId}@alux-e2e.test`;
const firstPassword = 'First-Passphrase-123';
const secondPassword = 'Second-Passphrase-456';

let verificationLink = '';

test.describe.configure({ mode: 'serial' });

test.describe('Client journey against the real stack', () => {
  test('signup creates an account and the backend emails a verification link', async ({ page }) => {
    const logOffset = backendLogSize();

    await page.goto('/client/signup');
    await page.getByLabel('Company Name', { exact: true }).fill(companyName);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(firstPassword);
    await page.getByRole('checkbox', { name: /agree.*privacy policy/i }).check();
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByRole('button', { name: /go to sign in/i })).toBeVisible();

    verificationLink = await waitForEmailLink('verification', logOffset);
    expect(verificationLink).toContain('/client/verify-email/');
  });

  test('sign-in is refused until the email address is verified', async ({ page }) => {
    await page.goto('/client/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(firstPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('alert')).toContainText(/verify your email/i);
    await expect(page).toHaveURL(/\/client\/login$/);
  });

  test('the emailed verification link verifies the account', async ({ page }) => {
    await page.goto(verificationLink);
    await expect(page.getByText('Email Verified', { exact: true })).toBeVisible();
  });

  test('a wrong password is rejected with a generic message', async ({ page }) => {
    await page.goto('/client/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Not-The-Right-Password-1');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('alert')).toContainText(/invalid credentials/i);
    await expect(page).toHaveURL(/\/client\/login$/);
  });

  test('sign-in opens the dashboard with an httpOnly session cookie, and logout ends it', async ({
    page,
  }) => {
    await page.goto('/client/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(firstPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/client\/dashboard$/);
    await expect(page.getByRole('heading', { name: companyName })).toBeVisible();

    // JavaScript on the page must not be able to read the session token.
    const cookies = await page.context().cookies(API_URL);
    const session = cookies.find((cookie) => cookie.name === 'clientToken');
    expect(session, 'clientToken cookie should be set').toBeDefined();
    expect(session?.httpOnly).toBe(true);

    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/client\/login$/);

    // The server-side session is gone, not just the page state.
    await page.goto('/client/dashboard');
    await expect(page).toHaveURL(/\/client\/login$/);
  });

  test('the "Forgot password?" link on the login page opens the reset request page', async ({
    page,
  }) => {
    await page.goto('/client/login');
    await page.getByRole('link', { name: /forgot password/i }).click();

    await expect(page).toHaveURL(/\/client\/forgot-password$/);
    await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
  });

  test('password reset works end to end and the old password stops working', async ({ page }) => {
    const logOffset = backendLogSize();

    await page.goto('/client/forgot-password');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: /send reset link/i }).click();
    await expect(page.getByRole('status')).toBeVisible();

    const resetLink = await waitForEmailLink('password reset', logOffset);
    expect(resetLink).toContain('/client/reset-password/');

    await page.goto(resetLink);
    await page.getByLabel('New Password', { exact: true }).fill(secondPassword);
    await page.getByLabel('Confirm Password', { exact: true }).fill(secondPassword);
    await page.getByRole('button', { name: /update password/i }).click();
    await expect(page.getByRole('link', { name: /go to login/i })).toBeVisible();

    // New password signs in.
    await page.goto('/client/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(secondPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/client\/dashboard$/);
    await page.getByRole('button', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/client\/login$/);

    // The old one no longer does.
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(firstPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('alert')).toContainText(/invalid credentials/i);
  });
});
