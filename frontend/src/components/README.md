# Alux Plaza — Client Portal Layout & Pages

This package extends the client portal with a redesigned layout shell and
three new pages. Everything drops into the existing `frontend/` tree.

## Files

| File | Destination |
|------|-------------|
| `components/ClientLayout.tsx` | `frontend/src/components/ClientLayout.tsx` (replaces existing) |
| `pages/ClientCompliancePage.tsx` | `frontend/src/pages/ClientCompliancePage.tsx` (new) |
| `pages/ClientSecurityPage.tsx` | `frontend/src/pages/ClientSecurityPage.tsx` (new) |
| `pages/ClientSessionsPage.tsx` | `frontend/src/pages/ClientSessionsPage.tsx` (new) |
| `App.tsx` | `frontend/src/App.tsx` (replaces existing — adds 3 routes) |

## What changed

### ClientLayout — redesigned (option 4: something new)

The old top-header layout is replaced with a **sidebar navigation shell**:

- **Left sidebar** (desktop): ALUX PLAZA brand block, icon + label nav
  links with active-state highlighting, and a client identity card at
  the bottom (deterministic initials avatar coloured by company name).
- **Slim topbar**: page title (via the new `title` prop), `ThemeToggle`,
  and Logout. Sticky, with a backdrop blur.
- **Mobile**: sidebar collapses to an off-canvas drawer toggled by a
  hamburger button; closes automatically on route change.
- **Auth-gating unchanged**: `/api/client/me` 401/404 still redirects to
  `/client/login` before children render.
- **Nav is data-driven**: the `NAV_ITEMS` array at the top of the file is
  the single place to add/remove nav entries.

### New pages (all wrapped in ClientLayout, lazy-loaded in App.tsx)

| Route | Page | Data source |
|-------|------|-------------|
| `/client/compliance` | `ClientCompliancePage` | `GET /api/client/compliance` — score ring, status filter chips, per-framework item cards |
| `/client/security` | `ClientSecurityPage` | `GET /api/client/security-events` — paginated login history, failed-attempt banner |
| `/client/sessions` | `ClientSessionsPage` | `GET /api/client/sessions` + `POST /api/client/sessions/:jti/revoke` — session cards with one-click revoke |

## Integration steps

1. Copy `components/ClientLayout.tsx` over `frontend/src/components/ClientLayout.tsx`.
2. Copy the three `pages/Client*.tsx` files into `frontend/src/pages/`.
3. Replace `frontend/src/App.tsx` with the included version (or just add
   the three new lazy imports and `<Route>` entries to your existing file).
4. No backend changes needed — all endpoints already exist.

## Notes

- The existing `ClientDashboard.tsx` needs **no changes** — it already
  uses the `ClientLayout` render-prop API, which is unchanged.
- The `title` prop on `ClientLayout` is optional; existing usage without
  it still works.
- All styling uses the existing Tailwind tokens (`navy-*`, `alux-*`),
  no config changes required.
