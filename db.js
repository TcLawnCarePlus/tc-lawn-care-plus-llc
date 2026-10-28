// Storage layer: Postgres when DATABASE_URL is set, otherwise a local
// SQLite file (local testing only). Both backends expose the same methods.
// No phone numbers, credentials, or secrets are stored in this file.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

let mode = null; // 'postgres' | 'sqlite'
let pool = null;
let sqlite = null;

function mapBooking(r) {
  if (!r) return null;
  return {
    id: r.id,
    location: r.location,
    yardSize: r.yard_size,
    workNeeded: r.work_needed,
    name: r.name,
    phone: r.phone,
    status: r.status,
    dingStatus: r.ding_status,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

function mapReview(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    stars: r.stars,
    text: r.text,
    service: r.service,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

async function init() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
    });
    mode = "postgres";
    await pool.query(`CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      location TEXT NOT NULL,
      yard_size TEXT DEFAULT '',
      work_needed TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      ding_status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      stars INTEGER NOT NULL,
      text TEXT NOT NULL,
      service TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
  } else {
    const { DatabaseSync } = require("node:sqlite");
    const file = process.env.SQLITE_PATH || path.join(__dirname, "data", "tc.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    sqlite = new DatabaseSync(file);
    mode = "sqlite";
    sqlite.exec(`CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT NOT NULL,
      yard_size TEXT DEFAULT '',
      work_needed TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      ding_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    )`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      stars INTEGER NOT NULL,
      text TEXT NOT NULL,
      service TEXT DEFAULT '',
      created_at TEXT NOT NULL
    )`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
  }
  return mode;
}

function dbMode() {
  return mode;
}

async function createBooking(b) {
  const now = new Date().toISOString();
  if (mode === "postgres") {
    const { rows } = await pool.query(
      `INSERT INTO bookings (location, yard_size, work_needed, name, phone, status, ding_status, created_at)
       VALUES ($1,$2,$3,$4,$5,'new',$6,$7) RETURNING *`,
      [b.location, b.yardSize || "", b.workNeeded, b.name, b.phone || "", b.dingStatus || "pending", now]
    );
    return mapBooking(rows[0]);
  }
  const info = sqlite
    .prepare(
      `INSERT INTO bookings (location, yard_size, work_needed, name, phone, status, ding_status, created_at)
       VALUES (?,?,?,?,?,'new',?,?)`
    )
    .run(b.location, b.yardSize || "", b.workNeeded, b.name, b.phone || "", b.dingStatus || "pending", now);
  return getBooking(info.lastInsertRowid);
}

async function getBooking(id) {
  if (mode === "postgres") {
    const { rows } = await pool.query(`SELECT * FROM bookings WHERE id = $1`, [id]);
    return mapBooking(rows[0]);
  }
  const row = sqlite.prepare(`SELECT * FROM bookings WHERE id = ?`).get(id);
  return mapBooking(row);
}

async function listBookings() {
  if (mode === "postgres") {
    const { rows } = await pool.query(`SELECT * FROM bookings ORDER BY id DESC`);
    return rows.map(mapBooking);
  }
  return sqlite.prepare(`SELECT * FROM bookings ORDER BY id DESC`).all().map(mapBooking);
}

async function updateBooking(id, patch) {
  if (mode === "postgres") {
    const sets = [];
    const vals = [];
    if (patch.status !== undefined) {
      vals.push(patch.status);
      sets.push(`status = $${vals.length}`);
    }
    if (patch.dingStatus !== undefined) {
      vals.push(patch.dingStatus);
      sets.push(`ding_status = $${vals.length}`);
    }
    if (!sets.length) return getBooking(id);
    vals.push(id);
    await pool.query(`UPDATE bookings SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
    return getBooking(id);
  }
  if (patch.status !== undefined) {
    sqlite.prepare(`UPDATE bookings SET status = ? WHERE id = ?`).run(patch.status, id);
  }
  if (patch.dingStatus !== undefined) {
    sqlite.prepare(`UPDATE bookings SET ding_status = ? WHERE id = ?`).run(patch.dingStatus, id);
  }
  return getBooking(id);
}

async function deleteBooking(id) {
  if (mode === "postgres") {
    await pool.query(`DELETE FROM bookings WHERE id = $1`, [id]);
  } else {
    sqlite.prepare(`DELETE FROM bookings WHERE id = ?`).run(id);
  }
}

async function createReview(r) {
  const now = new Date().toISOString();
  if (mode === "postgres") {
    const { rows } = await pool.query(
      `INSERT INTO reviews (name, stars, text, service, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [r.name, r.stars, r.text, r.service || "", now]
    );
    return mapReview(rows[0]);
  }
  const info = sqlite
    .prepare(`INSERT INTO reviews (name, stars, text, service, created_at) VALUES (?,?,?,?,?)`)
    .run(r.name, r.stars, r.text, r.service || "", now);
  const row = sqlite.prepare(`SELECT * FROM reviews WHERE id = ?`).get(info.lastInsertRowid);
  return mapReview(row);
}

async function listReviews() {
  if (mode === "postgres") {
    const { rows } = await pool.query(`SELECT * FROM reviews ORDER BY id DESC`);
    return rows.map(mapReview);
  }
  return sqlite.prepare(`SELECT * FROM reviews ORDER BY id DESC`).all().map(mapReview);
}

async function getSetting(key) {
  if (mode === "postgres") {
    const { rows } = await pool.query(`SELECT value FROM settings WHERE key = $1`, [key]);
    return rows.length ? rows[0].value : null;
  }
  const row = sqlite.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  if (mode === "postgres") {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  } else {
    sqlite.prepare(`INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  }
}

// Owner password: scrypt hash, stored as "scrypt:<saltHex>:<hashHex>".
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const [, salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuf = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actual, expectedBuf);
}

module.exports = {
  init,
  dbMode,
  createBooking,
  getBooking,
  listBookings,
  updateBooking,
  deleteBooking,
  createReview,
  listReviews,
  getSetting,
  setSetting,
  hashPassword,
  verifyPassword,
};
