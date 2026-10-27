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
  try {
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
      `What needs done: ${booking.workNeeded}`,
      "",
      `Booking ID: ${booking.id}`,
      `Received: ${booking.createdAt}`,
    ].filter(Boolean);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `New booking from ${booking.name}`,
      text: lines.join("\n"),
    });
    return { ok: true, status: "sent" };
  } catch (err) {
    console.error("Ding email failed:", err && err.message ? err.message : err);
    return { ok: false, status: "failed" };
  }
}

module.exports = { smtpConfigured, sendDing };
