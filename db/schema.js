// db/schema.js
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'inventory.db');
let db = null;

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_code TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    default_spq INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS boxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    box_number TEXT UNIQUE NOT NULL,
    item_code TEXT NOT NULL,
    reel_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_code) REFERENCES items(item_code)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reel_number TEXT UNIQUE NOT NULL,
    item_code TEXT NOT NULL,
    box_number TEXT,
    quantity INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'In Stock',
    inward_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (item_code) REFERENCES items(item_code),
    FOREIGN KEY (box_number) REFERENCES boxes(box_number)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS outwards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reel_number TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    quantity_shipped INTEGER NOT NULL,
    outward_type TEXT NOT NULL DEFAULT 'Full',
    outward_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY (reel_number) REFERENCES reels(reel_number)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 10000
  )`);

  const reelCounter = db.exec("SELECT value FROM counters WHERE name = 'reel'");
  if (!reelCounter.length) {
    db.run("INSERT INTO counters (name, value) VALUES ('reel', 10000)");
  }
  const boxCounter = db.exec("SELECT value FROM counters WHERE name = 'box'");
  if (!boxCounter.length) {
    db.run("INSERT INTO counters (name, value) VALUES ('box', 1000)");
  }

  saveDB();
  return db;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

function execute(sql, params = []) {
  db.run(sql, params);
  saveDB();
  return { changes: db.getRowsModified() };
}

function getNextReelNumber() {
  db.run("UPDATE counters SET value = value + 1 WHERE name = 'reel'");
  const result = db.exec("SELECT value FROM counters WHERE name = 'reel'");
  const value = result[0].values[0][0];
  saveDB();
  return `REEL-${value}`;
}

function getNextBoxNumber() {
  db.run("UPDATE counters SET value = value + 1 WHERE name = 'box'");
  const result = db.exec("SELECT value FROM counters WHERE name = 'box'");
  const value = result[0].values[0][0];
  saveDB();
  return `BOX-${value}`;
}

module.exports = { initDB, queryAll, queryOne, execute, getNextReelNumber, getNextBoxNumber, saveDB };