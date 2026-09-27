# Deploying the Backend to Render + Neon (free)

Replaces the old Railway setup (free trial ended). Total cost: $0.
Downtime trade-off of free tiers: after ~15 minutes without traffic the
API sleeps and the next request takes up to ~50s to wake it.

## Architecture

| Piece       | Service                        | Plan             |
| ----------- | ------------------------------ | ---------------- |
| Frontend    | Vercel (`jinarous.vercel.app`) | Free (unchanged) |
| Backend API | Render web service             | Free             |
| PostgreSQL  | Neon                           | Free (0.5 GB)    |

## 1. Create the database (Neon)

1. Sign up at [neon.tech](https://neon.tech) with GitHub (no card).
2. Create a project (any name, e.g. `alux-plaza`).
3. Open the **Connection Details** / dashboard and copy the
   connection string. It looks like:
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`
4. Keep this tab open — you'll paste it into Render next.
   **Treat it like a password** (it contains one).

Neon's default string uses their **pooled** endpoint (`-pooler`), which
is what you want for this app.

## 2. Deploy the backend (Render)

1. Sign up at [render.com](https://render.com) with GitHub (no card).
2. Click this button:

   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sybertoooth7-lgtm/ALUXPLAZA)

   (or: Render dashboard → New → Blueprint → pick this repo — it reads
   `render.yaml` from the repo root.)

3. When prompted for environment variables, fill in:
   - **DATABASE_URL** — paste the Neon connection string from step 1.
   - **ADMIN_BOOTSTRAP_EMAIL** — your real email.
   - **ADMIN_BOOTSTRAP_PASSWORD** — a strong password (min 8 chars;
     use 12+). You'll log into the admin dashboard with these once.
   - `JWT_SECRET` is generated automatically by Render.
4. Click **Apply**. First deploy takes a few minutes. Migrations run
   automatically on boot (`src/db.js` applies `backend/migrations/*.sql`
   in order), and the bootstrap above creates the first admin while the
   users table is still empty.
5. Verify: open `https://alux-plaza-backend.onrender.com/api/health`
   (your exact URL is shown on the service page) → should return
   `{"status":"ok"}`.

## 3. Remove the bootstrap variables

Render service page → **Environment** → delete
`ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`.
They are inert once an admin exists (the bootstrap only fires on an
empty `admin_users` table), but removing them is good hygiene since
they contain your login.

## 4. Point the frontend at the new backend

1. Vercel project **Settings → Environment Variables**:
   - Set `VITE_API_BASE_URL` to your Render URL,
     e.g. `https://alux-plaza-backend.onrender.com`
2. Redeploy: **Deployments → ⋯ → Redeploy** (env var changes don't
   apply to already-built bundles).

## 5. Ongoing deploys

Pushes to `main` under `backend/**` run Backend CI, then Render
auto-deploys the new commit (GitHub App integration, no tokens stored
in the repo — the old Railway token flow is gone).

## Notes & limits

- **Cold starts**: first request after idle can take ~50s. If that's
  unacceptable, Render paid plans keep the service warm.
- Neon free tier autosuspends the database compute after inactivity;
  it wakes automatically on the next connection (adds a few seconds).
- The admin dashboard lives at `<backend-url>/admin`.
- `tools/` Python audit tools need python3 + `requests` on the host;
  Render's native Node runtime doesn't include them, so those admin
  endpoints will report tool-unavailable errors. Everything else works.
