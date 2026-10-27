# TC Lawn Care Plus LLC — Render-ready website

A standalone Node.js (Express) app: a static public page plus a small API.
It is the "saving version" of the site, rebuilt as plain code so it can run
on Render as one web service. No Render service, database, or deployment is
created by this code on its own.

## What it does

- Public page: logo and company-name banner, long Book Now button under the
  banner, grass background, featured pictures with bullet caption, services,
  our-work pictures, the Meet T. Craig section, reviews, and a booking form.
- Booking form fields: where it is, yard size estimate, what needs done, plus
  the customer's own name and phone (the customer's phone stays on the form
  and the owner side so the team can call back).
- Bookings SAVE to the database. After booking, the visitor sees the logo
  above a green "Successfully booked" message, the reach-out line ("we will
  reach out — a team member will reach out, usually within the hour"), and a
  "Book another job" button, plus a "Copy booking details" button.
- Owner side is PIN-gated: the owner sets a PIN on first open (hashed with
  scrypt on the server; no PIN is ever stored in plain text). It shows a
  notification count for new bookings plus each full booking, with Mark seen,
  Mark done, and Remove controls, and each booking's email-ding status.
- Reviews: the one approved real review is shown on the page, plus a
  leave-a-review form with a 1–5 star picker. Visitor reviews save and list.
  No other reviews are invented, copied, or pre-filled.
- Booking ding email: when a booking lands, an alert email with the full
  booking details is sent to the ding address (the stored ding-email setting,
  or `DING_TO` if none is stored). A failed or unconfigured ding NEVER
  blocks the booking from saving — the booking is saved first, and the ding
  status on the booking reads sent, failed, not set up yet, or on its way.
- No business phone number appears anywhere on any public page, button,
  link, or image. The trailer pictures used here are cleaned copies: the
  painted-on number (and the QR code on the real trailer photo) were painted
  out of the copies only; the original photos were not modified. The
  tight logo-badge crop needed no change. No video and no QR code are on the
  page, and the worker cleanup picture with the unconfirmed claim line is
  not used (the redo version is used instead).

## Run locally

```sh
npm install
npm start
# open http://localhost:3000
```

Local runs use a SQLite file at `data/tc.db` (created automatically) and
need no Postgres and no SMTP. With no SMTP configured, bookings save with
ding status "not set up yet".

## Render service settings

Create ONE web service (free plan is fine to start):

| Setting        | Value            |
| -------------- | ---------------- |
| Environment    | Node             |
| Build command  | `npm install`    |
| Start command  | `npm start`      |
| Plan           | Free             |
| Node version   | 22 or newer (the app uses `node:sqlite` only for the local fallback; on Render, Postgres is used when `DATABASE_URL` is set) |

Or deploy from the included `render.yaml` Blueprint (dashboard → New →
Blueprint), which also provisions the Postgres database below.

### Database

- With `DATABASE_URL` set (Render Postgres attached), all bookings, reviews,
  the owner PIN hash, and the ding-email setting persist in Postgres.
- Without it, the app falls back to the local SQLite file — for local
  testing only. On Render's free plan the web service sleeps when idle and
  the free Postgres database is time-limited, so a persistent database is
  worth confirming before relying on it for real bookings.

### Environment variables (Render dashboard → Environment)

| Variable    | Required? | Purpose |
| ----------- | --------- | ------- |
| `DATABASE_URL` | Yes on Render | Postgres connection string (set automatically when the Render database is attached). |
| `SMTP_HOST` | For the ding | SMTP server host for booking alert emails. |
| `SMTP_PORT` | For the ding | SMTP port (587 for STARTTLS, 465 for SSL). Defaults to 587. |
| `SMTP_USER` | For the ding | SMTP login. |
| `SMTP_PASS` | For the ding | SMTP password / app password. |
| `SMTP_FROM` | No | Sender address shown on ding emails. Defaults to `SMTP_USER`. |
| `DING_TO`   | For the ding | Default address booking dings go to, until the owner changes it in the owner side's ding-email setting. |

If SMTP is not configured, bookings still save and the ding status simply
reads "not set up yet".

## API summary

- `GET /api/health` — `{ ok, db }` (`postgres` or `sqlite`).
- `POST /api/bookings` — public; creates a booking (201). Never fails because
  of the ding.
- `GET /api/owner/status` — whether an owner PIN is set.
- `POST /api/owner/pin` — set the PIN on first open (or change it with the
  current PIN in the `x-owner-pin` header).
- `POST /api/owner/verify` — check a PIN.
- `GET /api/owner/bookings` — owner PIN required (`x-owner-pin` header);
  returns bookings plus a new-booking count.
- `PATCH /api/owner/bookings/:id` — owner PIN required; `{ status }` is
  `new`, `seen`, or `done`.
- `DELETE /api/owner/bookings/:id` — owner PIN required.
- `GET /api/owner/ding-email` / `PUT /api/owner/ding-email` — owner PIN
  required; read or change the ding address.
- `GET /api/reviews` / `POST /api/reviews` — public; list or add a review.

## Still needed before a Render deploy (not done here)

1. **Code home / repo** — push this folder to a Git repo (for example
   GitHub) so Render can pull it, or upload it through Render's flow.
2. **Render web service** — create it from that repo (or from
   `render.yaml`), free plan to start.
3. **Database** — attach a Render Postgres database so `DATABASE_URL` is
   set; otherwise the app has nowhere persistent to save on Render.
4. **SMTP for the ding** — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASS`, and `DING_TO` in Render's Environment settings, or the ding
   stays "not set up yet" (bookings still save). A free Gmail account needs
   an app password for SMTP; the future company Outlook address can replace
   the ding address later from the owner side's ding-email setting, with no
   code change.
5. **Domain (after hosting)** — point the company-name .com domain at the
   Render service once it is live, if a custom address is wanted.
6. **Owner first open** — the owner opens the owner side once on the live
   site and sets the owner PIN; the ding-email setting can be checked there
   at the same time.
