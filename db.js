// db.js - everything that touches SQLite lives here.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// On a host with a persistent disk, point DB_PATH at it (e.g. /data/spendlog.db).
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'spendlog.db');
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Money is stored as INTEGER centavos (1250 = 12.50) so sums never suffer
// floating-point drift. Dates are stored as 'YYYY-MM-DD' text, which sorts
// and compares correctly as plain strings.
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL,
    description  TEXT    NOT NULL,
    category     TEXT    NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
`);

// Builds the optional "WHERE date >= ? AND date <= ?" used by the table
// and all three reports, so the filter behaves identically everywhere.
// Both ends are inclusive (>= and <=), as the brief requires.
function rangeClause(start, end) {
  const parts = [];
  const params = [];
  if (start) { parts.push('date >= ?'); params.push(start); }
  if (end)   { parts.push('date <= ?'); params.push(end); }
  return { where: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}

const toMoney = (cents) => cents / 100;

function listExpenses(start, end) {
  const { where, params } = rangeClause(start, end);
  return db
    .prepare(`SELECT id, date, description, category, amount_cents
              FROM expenses ${where} ORDER BY date DESC, id DESC`)
    .all(...params)
    .map((r) => ({ id: r.id, date: r.date, description: r.description,
                   category: r.category, amount: toMoney(r.amount_cents) }));
}

function addExpense({ date, description, category, amountCents }) {
  const info = db
    .prepare(`INSERT INTO expenses (date, description, category, amount_cents)
              VALUES (?, ?, ?, ?)`)
    .run(date, description, category, amountCents);
  return info.lastInsertRowid;
}

function deleteExpense(id) {
  return db.prepare('DELETE FROM expenses WHERE id = ?').run(id).changes > 0;
}

// The three required reports, each one GROUP BY query over the filtered rows.
function reports(start, end) {
  const { where, params } = rangeClause(start, end);
  const run = (sql) =>
    db.prepare(sql).all(...params).map((r) => ({ label: r.label, total: toMoney(r.total) }));

  return {
    // Category names are compared case-insensitively ("Food" == "food").
    category: run(`SELECT MIN(category) AS label, SUM(amount_cents) AS total
                   FROM expenses ${where}
                   GROUP BY category COLLATE NOCASE ORDER BY total DESC`),
    daily: run(`SELECT date AS label, SUM(amount_cents) AS total
                FROM expenses ${where} GROUP BY date ORDER BY date`),
    // substr(date, 1, 7) turns '2026-11-26' into '2026-11' (the month).
    monthly: run(`SELECT substr(date, 1, 7) AS label, SUM(amount_cents) AS total
                  FROM expenses ${where} GROUP BY label ORDER BY label`),
    grandTotal: toMoney(
      db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS t FROM expenses ${where}`)
        .get(...params).t
    ),
  };
}

function categories() {
  return db.prepare('SELECT MIN(category) AS c FROM expenses GROUP BY category COLLATE NOCASE ORDER BY c')
    .all().map((r) => r.c);
}

module.exports = { listExpenses, addExpense, deleteExpense, reports, categories };
