// Booking ding email, via SMTP only. A failed or unconfigured ding must
// NEVER block a booking from saving: sendDing always resolves, and the
// caller records the returned status on the booking.
const nodemailer = require("nodemailer");

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendDing({ to, booking }) {
  if (!smtpConfigured() || !to) {
    return { ok: false, status: "not_configured" };
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const lines = [
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
  const mail = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `🚨 NEW LAWN JOB — ${booking.name} booked us! Go get it! 🚨`,
    text: lines.join("\n"),
  };
  // The free instance sleeps when idle and can time out the first SMTP
  // connect right after waking up. Retry once, briefly, on a connection
  // timeout only — never on an auth error (retrying that is pointless).
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await transporter.sendMail(mail);
      return { ok: true, status: "sent" };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const isTimeout = err && (err.code === "ETIMEDOUT" || /connection timeout/i.test(msg));
      console.error(`Ding email failed (attempt ${attempt}):`, msg);
      if (!isTimeout || attempt === 2) {
        return { ok: false, status: "failed" };
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  return { ok: false, status: "failed" };
}

module.exports = { smtpConfigured, sendDing };
