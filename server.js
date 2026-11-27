const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

function readRange(query) {
  const start = query.start || '';
  const end = query.end || '';
  if (start && !isValidDate(start)) return { error: 'Invalid start date.' };
  if (end && !isValidDate(end)) return { error: 'Invalid end date.' };
  if (start && end && start >= end) return { error: 'Start date must be earlier than end date.' };
  return { start, end };
}

function readPagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 10 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
    return { error: 'Page must be a positive whole number.' };
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
    return { error: 'Page size must be between 1 and 100.' };
  return { page, pageSize };
}

function handleAsync(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get('/api/health', async (_req, res) => {
  try {
    await db.pingDatabase();
    res.json({ ok: true });
  } catch (error) {
    console.error('SpendLog health check failed:', error.message);
    res.status(503).json({ ok: false });
  }
});

app.get('/api/expenses', handleAsync(async (req, res) => {
  const range = readRange(req.query);
  if (range.error) return res.status(400).json({ error: range.error });
  const pagination = readPagination(req.query);
  if (pagination.error) return res.status(400).json({ error: pagination.error });
  res.json(await db.listExpenses(range.start, range.end, pagination.page, pagination.pageSize));
}));

app.post('/api/expenses', handleAsync(async (req, res) => {
  const date = clean(req.body.date);
  const description = clean(req.body.description);
  const category = clean(req.body.category);
  const amount = Number(req.body.amount);

  if (!isValidDate(date)) return res.status(400).json({ error: 'Enter a valid date.' });
  if (!description || description.length > 200)
    return res.status(400).json({ error: 'Description is required (max 200 characters).' });
  if (!category || category.length > 50)
    return res.status(400).json({ error: 'Category is required (max 50 characters).' });
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1e9)
    return res.status(400).json({ error: 'Amount must be a positive whole number.' });

  const id = await db.addExpense({ date, description, category, amountCents: amount * 100 });
  res.status(201).json({ id });
}));

app.delete('/api/expenses/:id', handleAsync(async (req, res) => {
  const deleted = await db.deleteExpense(req.params.id);
  res.json({ ok: true, deleted });
}));

app.get('/api/reports', handleAsync(async (req, res) => {
  const range = readRange(req.query);
  if (range.error) return res.status(400).json({ error: range.error });
  res.json(await db.reports(range.start, range.end));
}));

app.get('/api/categories', handleAsync(async (_req, res) => {
  res.json(await db.categories());
}));

app.use((error, _req, res, _next) => {
  console.error('SpendLog request failed:', error.message);
  res.status(500).json({ error: 'The request could not be completed.' });
});

module.exports = app;

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`SpendLog running on port ${port}`));
}
