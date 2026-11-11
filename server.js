// TC Lawn Care Plus LLC — Express app for Render (one web service).
// Serves the static page in public/ plus a small JSON API:
//   bookings (public create; owner list/update/remove)
//   reviews  (public create/list)
//   owner login + password (set on first open, password hashed server-side)
//   + ding-email setting
// A failed email ding never blocks a booking from saving.
const express = require("express");
const path = require("path");
const db = require("./db");
const { smtpConfigured, gmailConfigured, sendDing } = require("./ding");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

function clean(v) {
  return typeof v === "string" ? v.trim() : "";
}

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");
}

// Start-over passcode: the owner knows it; it is checked server-side before
// the owner login, password, and ding email are cleared. Change this value
// to change the passcode.
const OWNER_RESET_PASSCODE = "7150";

app.get("/api/health", (req, res) => {
  res.json({ ok: true, db: db.dbMode() });
});

// ---- Owner login ---------------------------------------------------------
app.get("/api/owner/status", async (req, res) => {
  const stored = await db.getSetting("owner_password_hash");
  res.json({ loginSet: Boolean(stored) });
});

// Set the login on first open. Only possible while none is set yet; the
// owner picks both values himself on the page, never in chat.
app.post("/api/owner/setup", async (req, res) => {
  const existing = await db.getSetting("owner_password_hash");
  if (existing) return res.status(409).json({ error: "An owner login is already set." });
  const login = clean(req.body && req.body.login);
  const password = clean(req.body && req.body.password);
  if (login.length < 3 || login.length > 64) {
    return res.status(400).json({ error: "Login must be 3 to 64 characters." });
  }
  if (password.length < 6 || password.length > 64) {
    return res.status(400).json({ error: "Password must be 6 to 64 characters." });
  }
  await db.setSetting("owner_login", login);
  await db.setSetting("owner_password_hash", db.hashPassword(password));
  res.json({ ok: true });
});

app.post("/api/owner/verify", async (req, res) => {
  const stored = await db.getSetting("owner_password_hash");
  if (!stored) return res.json({ ok: false, loginSet: false });
  const login = clean(req.body && req.body.login);
  const password = clean(req.body && req.body.password);
  const savedLogin = await db.getSetting("owner_login");
  res.json({ ok: login === savedLogin && db.verifyPassword(password, stored), loginSet: true });
});

async function ownerAuth(req, res, next) {
  const stored = await db.getSetting("owner_password_hash");
  if (!stored) return res.status(401).json({ error: "Owner login is not set yet." });
  const login = req.headers["x-owner-login"] || "";
  const password = req.headers["x-owner-password"] || "";
  const savedLogin = await db.getSetting("owner_login");
  if (login !== savedLogin || !db.verifyPassword(password, stored)) {
    return res.status(401).json({ error: "Owner login is incorrect." });
  }
  next();
}

// ---- Bookings ------------------------------------------------------------
app.post("/api/bookings", async (req, res) => {
  const booking = {
    location: clean(req.body && req.body.location),
    yardSize: clean(req.body && req.body.yardSize),
    service: clean(req.body && req.body.service),
    preferredDate: clean(req.body && req.body.preferredDate),
    workNeeded: clean(req.body && req.body.workNeeded),
    name: clean(req.body && req.body.name),
    phone: clean(req.body && req.body.phone),
  };
  if (!booking.location || !booking.workNeeded || !booking.name || !booking.service) {
    return res.status(400).json({ error: "Where it is, what needs done, your name, and a service are required." });
  }
  // Save FIRST. The ding is best-effort afterwards and never blocks this.
  const dingReady = smtpConfigured() || gmailConfigured();
  const saved = await db.createBooking({
    ...booking,
    dingStatus: dingReady ? "pending" : "not_configured",
  });
  if (dingReady) {
    setImmediate(async () => {
      try {
        const to = (await db.getSetting("ding_email")) || process.env.DING_TO || "";
        const result = await sendDing({ to, booking: saved });
        await db.updateBooking(saved.id, { dingStatus: result.status });
      } catch (err) {
        console.error("Ding background task failed:", err && err.message ? err.message : err);
        try {
          await db.updateBooking(saved.id, { dingStatus: "failed" });
        } catch (_) {
          /* booking itself is already saved; nothing else to do */
        }
      }
    });
  }
  res.status(201).json(saved);
});

app.get("/api/owner/bookings", ownerAuth, async (req, res) => {
  const bookings = await db.listBookings();
  const newCount = bookings.filter((b) => b.status === "new").length;
  res.json({ bookings, newCount });
});

app.patch("/api/owner/bookings/:id", ownerAuth, async (req, res) => {
  const status = clean(req.body && req.body.status);
  if (!["new", "seen", "done"].includes(status)) {
    return res.status(400).json({ error: "Status must be new, seen, or done." });
  }
  const updated = await db.updateBooking(req.params.id, { status });
  if (!updated) return res.status(404).json({ error: "Booking not found." });
  res.json(updated);
});

app.delete("/api/owner/bookings/:id", ownerAuth, async (req, res) => {
  const existing = await db.getBooking(req.params.id);
  if (!existing) return res.status(404).json({ error: "Booking not found." });
  await db.deleteBooking(req.params.id);
  res.json({ ok: true });
});

// ---- Ding-email setting (owner only) --------------------------------------
app.get("/api/owner/ding-email", ownerAuth, async (req, res) => {
  const stored = await db.getSetting("ding_email");
  res.json({
    email: stored || process.env.DING_TO || null,
    fromSetting: Boolean(stored),
    smtpConfigured: smtpConfigured(),
  });
});

app.put("/api/owner/ding-email", ownerAuth, async (req, res) => {
  const email = clean(req.body && req.body.email);
  if (!validEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  await db.setSetting("ding_email", email);
  res.json({ ok: true, email });
});

// ---- Start over (no login needed) -----------------------------------------
// Clears the owner login, password, and ding email so the owner side opens
// like the first time. Bookings are NOT touched. This runs BEFORE login on
// purpose, so a forgotten login can be replaced — the start-over passcode
// is the only gate, so wrong guesses are limited: 5 wrong tries from one
// address lock the reset out for 15 minutes.
const resetAttempts = new Map(); // address -> { fails, lockedUntil }
app.post("/api/owner/reset", async (req, res) => {
  const ip = req.ip || "";
  const rec = resetAttempts.get(ip);
  if (rec && rec.lockedUntil && Date.now() < rec.lockedUntil) {
    return res.status(429).json({ error: "Too many wrong passcodes. Try again in 15 minutes." });
  }
  if (rec && rec.lockedUntil && Date.now() >= rec.lockedUntil) resetAttempts.delete(ip);
  const passcode = clean(req.body && req.body.passcode);
  if (passcode !== OWNER_RESET_PASSCODE) {
    const next = resetAttempts.get(ip) || { fails: 0, lockedUntil: 0 };
    next.fails += 1;
    if (next.fails >= 5) next.lockedUntil = Date.now() + 15 * 60 * 1000;
    resetAttempts.set(ip, next);
    return res.status(403).json({ error: "That passcode is incorrect." });
  }
  resetAttempts.delete(ip);
  await db.deleteSetting("owner_login");
  await db.deleteSetting("owner_password_hash");
  await db.deleteSetting("ding_email");
  res.json({ ok: true });
});

// ---- Reviews ---------------------------------------------------------------
app.get("/api/reviews", async (req, res) => {
  res.json(await db.listReviews());
});

app.post("/api/reviews", async (req, res) => {
  const stars = Number(req.body && req.body.stars);
  const review = {
    name: clean(req.body && req.body.name),
    stars: Number.isInteger(stars) ? stars : 0,
    text: clean(req.body && req.body.text),
    service: clean(req.body && req.body.service),
  };
  if (!review.name || !review.text || review.stars < 1 || review.stars > 5) {
    return res.status(400).json({ error: "Name, a 1 to 5 star rating, and review words are required." });
  }
  const saved = await db.createReview(review);
  res.status(201).json(saved);
});

// Privacy policy page, served at /privacy-policy (linked from the
// Google OAuth consent screen for the booking-email app).
app.get("/privacy-policy", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "privacy-policy.html"));
});

// Owner panel: served only at /owner-side, unlinked from the public page,
// so customers browsing the site never see that an owner side exists.
// The login + password still guard everything behind it.
app.get("/owner-side", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "owner.html"));
});

// Fallback: anything that is not an API route serves the page.
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  next();
});

const PORT = process.env.PORT || 3000;
db.init()
  .then((mode) => {
    app.listen(PORT, () => {
      console.log(`TC Lawn Care Plus LLC listening on port ${PORT} (db: ${mode})`);
    });
  })
  .catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });
