// Booking ding email. Two send paths, in order:
// 1. Gmail API over HTTPS (port 443) — the path that works on Render's free
//    tier, where outbound SMTP ports 25, 465 and 587 are all blocked
//    (since Sep 26, 2025). Needs GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and
//    GMAIL_REFRESH_TOKEN.
// 2. SMTP via nodemailer — kept as a fallback for paid instances, where the
//    SMTP ports are unblocked.
// A failed or unconfigured ding must NEVER block a booking from saving:
// sendDing always resolves, and the caller records the returned status.
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function gmailConfigured() {
  return Boolean(
    process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN
  );
}

function dingSubject(booking) {
  return `🚨 NEW LAWN JOB — ${booking.name} booked us! Go get it! 🚨`;
}

function dingLines(booking) {
  return [
    "New booking for TC Lawn Care Plus LLC",
    "",
    `Customer: ${booking.name}`,
    booking.phone ? `Customer phone: ${booking.phone}` : null,
    `Where it is: ${booking.location}`,
    booking.yardSize ? `Yard size estimate: ${booking.yardSize}` : null,
    booking.service ? `Service: ${booking.service}` : null,
    booking.preferredDate ? `Preferred date: ${booking.preferredDate}` : null,
    `What needs done: ${booking.workNeeded}`,
    "",
    `Booking ID: ${booking.id}`,
    `Received: ${booking.createdAt}`,
  ].filter(Boolean);
}

function isTransientGmailError(err) {
  const status = err && (err.code || (err.response && err.response.status));
  if (status === 429 || (typeof status === "number" && status >= 500 && status < 600)) return true;
  const code = err && err.code;
  if (typeof code === "string" && ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND"].includes(code)) return true;
  const msg = err && err.message ? err.message : "";
  return /timeout|timed out|econnreset|socket hang up/i.test(msg);
}

async function sendViaGmailApi({ to, booking }) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const from = process.env.GMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  const headers = [
    from ? `From: ${from}` : null,
    `To: ${to}`,
    `Subject: ${dingSubject(booking)}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
  ].filter((line) => line !== null);
  const raw = Buffer.from([...headers, ...dingLines(booking)].join("\n"), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}

async function sendViaSmtp({ to, booking }) {
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const mail = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: dingSubject(booking),
    text: dingLines(booking).join("\n"),
  };
  // The free instance sleeps when idle and can time out the first SMTP
  // connect right after waking up. Retry once, briefly, on a connection
  // timeout only — never on an auth error (retrying that is pointless).
  // Note: on Render's free tier all SMTP ports are blocked, so this path
  // is only expected to work on a paid instance.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await transporter.sendMail(mail);
      return { ok: true, status: "sent" };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const isTimeout = err && (err.code === "ETIMEDOUT" || /connection timeout/i.test(msg));
      console.error(`Ding email failed (SMTP, attempt ${attempt}):`, msg);
      if (!isTimeout || attempt === 2) {
        return { ok: false, status: "failed" };
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  return { ok: false, status: "failed" };
}

async function sendDing({ to, booking }) {
  if (!to) {
    return { ok: false, status: "not_configured" };
  }
  if (gmailConfigured()) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await sendViaGmailApi({ to, booking });
        return { ok: true, status: "sent" };
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.error(`Ding email failed (Gmail API, attempt ${attempt}):`, msg);
        if (!isTransientGmailError(err) || attempt === 2) {
          return { ok: false, status: "failed" };
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    return { ok: false, status: "failed" };
  }
  if (!smtpConfigured()) {
    return { ok: false, status: "not_configured" };
  }
  return sendViaSmtp({ to, booking });
}

module.exports = { smtpConfigured, gmailConfigured, sendDing };
