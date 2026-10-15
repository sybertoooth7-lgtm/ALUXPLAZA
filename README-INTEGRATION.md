# Alux Plaza: Playwright + Swahili i18n integration

These files are designed around the currently published `frontend/` app:
React 19, Vite, TypeScript, Tailwind, React Router 7, and the existing
`/client/login`, `/client/signup`, and `/client/dashboard` routes.

## Files in this bundle

- `frontend/playwright.config.ts` — Playwright config using the Vite dev server.
- `frontend/e2e/public-pages.spec.ts` — public/client-route smoke tests and
  missing-session redirect tests.
- `frontend/src/i18n/translations.ts` — English and Swahili strings.
- `frontend/src/i18n/LanguageProvider.tsx` — language state and persistence.
- `frontend/src/components/LanguageSwitcher.tsx` — accessible language selector.

## 1. Add Playwright

From the repository root:

```bash
cd frontend
npm install --save-dev @playwright/test
npx playwright install chromium
```

Add these scripts to `frontend/package.json` under `scripts` (preserve all
existing scripts):

```json
{
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:report": "playwright show-report"
}
```

Run the tests:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

The E2E tests use route interception for the missing-session cases; they do not
need a real account or real email service. The public homepage test assumes Vite
can serve `/` and that the app has a non-empty document title. Run backend/API
and PostgreSQL integration tests separately; this suite does not replace them.

Because `frontend/package-lock.json` is tracked, commit the lockfile generated
by `npm install`. Do not manually edit the lockfile.

## 2. Connect the language provider

Update `frontend/src/main.tsx` to import the provider:

```tsx
import { LanguageProvider } from './i18n/LanguageProvider';
```

Wrap the current app inside `LanguageProvider` while preserving the existing
`StrictMode`, `ThemeProvider`, and `BrowserRouter` providers. The intended
provider nesting is:

```tsx
<StrictMode>
  <ThemeProvider>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </ThemeProvider>
</StrictMode>
```

Do not replace the entire current `main.tsx` with this snippet; retain the
existing imports, service-worker registration, and Sentry initialization.

## 3. Add the selector to the interface

Import and render the selector in the existing client header, for example in
`frontend/src/components/ClientLayout.tsx` near `ThemeToggle`:

```tsx
import LanguageSwitcher from '@/components/LanguageSwitcher';
```

Then render `<LanguageSwitcher />` beside the existing theme toggle.

The selector alone changes the stored language preference. To translate actual
screen text, replace hard-coded user-facing strings with `t('translationKey')`
from `useLanguage()`. Start with `ClientLogin.tsx`, `ClientSignup.tsx`,
`ClientLayout.tsx`, and `ClientDashboard.tsx`. This bundle deliberately does
not overwrite those existing application files because their current contents
and behavior must be preserved.

## 4. Acceptance checks

Run from `frontend/`:

```bash
npm run lint
npm run build
npm run test:e2e
```

The production build requires `VITE_API_BASE_URL` according to the existing
`prebuild` script. Set it to the intended local or staging backend URL before
running the build. Test with Node 24, as required by the repository.

## Scope and limitations

- These are new files plus integration instructions, not a claim that the
  changes have already been merged into the application.
- Playwright tests must be run locally/CI to confirm selectors and routes against
  the exact checked-out commit.
- Swahili translations are starter UI copy and should receive a final language
  review before production use.
