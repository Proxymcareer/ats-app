# ATS — a small, self-hosted applicant tracking system

Candidates apply directly on a public careers page (no LinkedIn, no email
inbox to manage). You review, search, and move them through a pipeline
from an admin dashboard.

## What it does

- **Public careers page** (`/`) — lists every open job.
- **Job page + application form** (`/jobs/:id`) — name, email, phone,
  LinkedIn/portfolio link, resume upload (PDF/Word/text, 8MB max), and a
  cover letter. One application per email per job.
- **Resume text extraction** — PDF and DOCX resumes are parsed on upload
  so they're searchable. (Legacy `.doc` and unreadable PDFs are still
  stored and downloadable, just not searchable by content.)
- **Admin dashboard** (`/admin`) — one login, protected by a password you
  set. Create/edit/close job postings, a per-job pipeline board
  (Applied → Screening → Interview → Offer → Hired / Rejected), a
  candidate detail page with notes and resume download, and full-text
  search across every resume and cover letter.

## Tech stack

Plain Node.js + Express + EJS templates + PostgreSQL. No build step, no
frontend framework — deliberately simple so it's easy to host cheaply and
easy to modify later. Resumes are stored as binary data directly in
Postgres (no separate file storage service to configure).

## Running it locally

You'll need Node 18+ and a local Postgres server.

```bash
npm install
cp .env.example .env        # then edit .env: set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm run migrate             # creates tables and seeds your admin account
npm start                   # http://localhost:3000
```

Log in at `/admin/login` with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set.
To change the admin password later, update those two environment
variables and run `npm run migrate` again (or redeploy — see below).

## Deploying to Render (free tier)

This repo includes a `render.yaml` "blueprint" that provisions both the
web app and a Postgres database automatically. You'll need a free Render
account and a GitHub account.

1. **Push this code to a new GitHub repo.**
   ```bash
   cd ats
   git init
   git add .
   git commit -m "Initial ATS"
   ```
   Create an empty repo on GitHub (github.com → New repository, don't
   initialize it with a README), then:
   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```

2. **Create a Render account** at render.com (sign up with GitHub is
   easiest — it handles the repo permission step for you).

3. **New → Blueprint** from the Render dashboard, and select the repo you
   just pushed. Render reads `render.yaml` and shows you a plan: one web
   service (`ats-web`) and one free Postgres database (`ats-db`). Click
   **Apply**.

4. Render will ask for two values it can't generate itself — the
   dashboard marks them "sync: false":
   - `ADMIN_EMAIL` — the email you'll log in with
   - `ADMIN_PASSWORD` — choose a strong password

   Set both under the `ats-web` service's **Environment** tab if it
   doesn't prompt you during setup.

5. Click **Deploy**. The build step runs `npm install && npm run migrate`,
   which creates the database tables and your admin account. First deploy
   takes a few minutes.

6. Once live, your careers page is at the `.onrender.com` URL Render
   gives you (or a custom domain you attach in the service's Settings).
   Log in at `<that URL>/admin/login`.

### A few things worth knowing about the free tier

- **The free Postgres database expires after 90 days** unless you
  upgrade it to a paid plan. Render emails you a warning before that
  happens. For a real hiring pipeline you don't want to lose, plan to
  upgrade the database (a few dollars a month) before then.
- **The free web service sleeps after 15 minutes of no traffic** and
  takes ~30-60 seconds to wake back up on the next request. Fine for a
  low-traffic careers page; upgrade to a paid instance if that's not
  acceptable for candidates.
- Sessions are stored in Postgres (not in memory), so admin logins
  survive the free service restarting or spinning down — you won't get
  logged out by an idle timeout.

### Updating the site later

Push to the `main` branch and Render redeploys automatically. Database
schema changes in `db/schema.sql` are applied automatically on every
deploy (the migration is written to be safe to re-run).

## Known limitations / good next steps

- Single admin account, no team roles yet (you asked to skip
  multi-reviewer collaboration for v1 — easy to add later: an `admins`
  table already exists, it just only has one row seeded from env vars).
- No email notifications (also out of scope for v1 by request) — you'll
  see new applicants by checking the dashboard or the "New" count on the
  jobs list.
- No CAPTCHA / spam protection on the public application form. If you
  get spam submissions, the cheapest fix is adding an invisible honeypot
  field or Cloudflare Turnstile.
- `express` currently has a moderate-severity transitive advisory via its
  `qs` dependency (a denial-of-service edge case in query-string
  parsing). Fixing it cleanly means moving to Express 5, which has some
  breaking changes — worth doing as a deliberate upgrade rather than
  bundled into this build.
