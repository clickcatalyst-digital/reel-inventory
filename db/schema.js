// db/schema.js
const { createClient } = require('@libsql/client');

let db = null;

async function initDB() {
  // Use Turso if URL is set, otherwise fall back to local SQLite file
  if (process.env.TURSO_URL) {
    db = createClient({
      url: process.env.TURSO_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
    console.log('Connected to Turso (cloud)');
  } else {
    db = createClient({ url: 'file:./inventory.db' });
    console.log('Connected to local SQLite');
  }

  await db.execute(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    default_spq INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS boxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    box_number TEXT UNIQUE NOT NULL,
    item_code TEXT NOT NULL,
    reel_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS reels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reel_number TEXT UNIQUE NOT NULL,
    item_code TEXT NOT NULL,
    box_number TEXT,
    quantity INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'In Stock',
    inward_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS outwards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reel_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    quantity_shipped INTEGER NOT NULL,
    outward_type TEXT NOT NULL DEFAULT 'Full',
    outward_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 10000
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed counters
  const reelCounter = await db.execute("SELECT value FROM counters WHERE name = 'reel'");
  if (!reelCounter.rows.length) {
    await db.execute("INSERT INTO counters (name, value) VALUES ('reel', 10000)");
  }
  const boxCounter = await db.execute("SELECT value FROM counters WHERE name = 'box'");
  if (!boxCounter.rows.length) {
    await db.execute("INSERT INTO counters (name, value) VALUES ('box', 1000)");
  }

  // Seed default admin user if no users exist
  const userCount = await db.execute("SELECT COUNT(*) as count FROM users");
  if (userCount.rows[0].count === 0) {
    await db.execute("INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin')");
    await db.execute("INSERT INTO users (username, password, role) VALUES ('pranav', 'lstech123', 'user')");
    await db.execute("INSERT INTO users (username, password, role) VALUES ('zakir', 'lstech123', 'user')");
    await db.execute("INSERT INTO users (username, password, role) VALUES ('sahil', 'lstech123', 'user')");
    // console.log('Default users created: admin/admin123, pranav/lstech123');
  }

  return db;
}

async function queryAll(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows;
}

async function queryOne(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return result.rows.length ? result.rows[0] : null;
}

async function execute(sql, params = []) {
  const result = await db.execute({ sql, args: params });
  return { changes: result.rowsAffected };
}

async function getNextReelNumber() {
  // Auto-heal: ensure counter is always ahead of actual max
  await db.execute(`
    UPDATE counters SET value = MAX(value, (
      SELECT COALESCE(MAX(CAST(REPLACE(reel_number, 'REEL-', '') AS INTEGER)), 10000)
      FROM reels
    )) WHERE name = 'reel'
  `);
  await db.execute("UPDATE counters SET value = value + 1 WHERE name = 'reel'");
  const result = await db.execute("SELECT value FROM counters WHERE name = 'reel'");
  return `REEL-${result.rows[0].value}`;
}

async function getNextBoxNumber() {
  await db.execute(`
    UPDATE counters SET value = MAX(value, (
      SELECT COALESCE(MAX(CAST(REPLACE(box_number, 'BOX-', '') AS INTEGER)), 1000)
      FROM boxes
    )) WHERE name = 'box'
  `);
  await db.execute("UPDATE counters SET value = value + 1 WHERE name = 'box'");
  const result = await db.execute("SELECT value FROM counters WHERE name = 'box'");
  return `BOX-${result.rows[0].value}`;
}

// Helper for adding new users
async function createUser(username, password, role = 'user') {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(password, 10);
  await db.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    [username, hash, role]);
}

function nowIST() {
  // Returns current time as IST string for storage
  const now = new Date();
  // IST = UTC + 5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  return ist.toISOString().replace('T', ' ').substring(0, 19);
}

module.exports = { initDB, queryAll, queryOne, execute, getNextReelNumber, getNextBoxNumber, createUser, nowIST };