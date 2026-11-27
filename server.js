// server.js - Express app: JSON API + static single-page frontend.
const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS so a frontend hosted elsewhere (e.g. Vercel) can call this API.
// Set CORS_ORIGIN on Render to your Vercel URL to lock it down.
app.use('/api', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Lightweight health check for UptimeRobot (keeps the Render free instance awake).
app.get('/health', (req, res) => res.json({ ok: true }));

// ---------- validation helpers ----------
// Accepts only real calendar dates written as YYYY-MM-DD (rejects 2026-02-30).
function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const clean = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// Reads ?start=&end= and checks them. Returns {error} or {start, end}.
function readRange(query) {
  const start = query.start || '';
  const end = query.end || '';
  if (start && !isValidDate(start)) return { error: 'Invalid start date.' };
  if (end && !isValidDate(end)) return { error: 'Invalid end date.' };
  if (start && end && start > end) return { error: 'Start date must not be after end date.' };
  return { start, end };
}

// ---------- routes ----------
app.get('/api/expenses', (req, res) => {
  const r = readRange(req.query);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(db.listExpenses(r.start, r.end));
});

app.post('/api/expenses', (req, res) => {
  const date = clean(req.body.date);
  const description = clean(req.body.description);
  const category = clean(req.body.category);
  const amount = Number(req.body.amount);

  if (!isValidDate(date)) return res.status(400).json({ error: 'Enter a valid date.' });
  if (!description || description.length > 200)
    return res.status(400).json({ error: 'Description is required (max 200 characters).' });
  if (!category || category.length > 50)
    return res.status(400).json({ error: 'Category is required (max 50 characters).' });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9)
    return res.status(400).json({ error: 'Amount must be a number greater than 0.' });

  const amountCents = Math.round(amount * 100);
  const id = db.addExpense({ date, description, category, amountCents });
  res.status(201).json({ id });
});

app.delete('/api/expenses/:id', (req, res) => {
  const ok = db.deleteExpense(Number(req.params.id));
  res.status(ok ? 200 : 404).json({ ok });
});

app.get('/api/reports', (req, res) => {
  const r = readRange(req.query);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(db.reports(r.start, r.end));
});

app.get('/api/categories', (req, res) => res.json(db.categories()));

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`SpendLog running on http://localhost:${port}`));
}
