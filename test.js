const assert = require('assert');
const { MongoClient } = require('mongodb');

if (!process.env.MONGODB_URI) {
  throw new Error('Set MONGODB_URI to run the integration tests.');
}

const testDatabase = `spendlog_test_${Date.now()}`;
process.env.MONGODB_DB = testDatabase;
const app = require('./server');
const db = require('./db');
const cleanupClient = new MongoClient(process.env.MONGODB_URI);

async function run() {
  await cleanupClient.connect();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://localhost:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const get = (url) => fetch(`${base}${url}`).then((response) => response.json());

  try {
    const data = [
      ['2026-10-31', 'Rice', 'Food', 120.1],
      ['2026-11-01', 'Jeep', 'Transport', 25],
      ['2026-11-01', 'Lunch', 'food', 85.2],
      ['2026-11-15', 'Load', 'Bills', 100],
      ['2026-12-02', 'Dinner', 'Food', 200.7],
    ];
    for (const [date, description, category, amount] of data) {
      assert.strictEqual((await post({ date, description, category, amount })).status, 201);
    }

    assert.strictEqual((await post({ date: '2026-02-30', description: 'x', category: 'y', amount: 1 })).status, 400);
    assert.strictEqual((await post({ date: '2026-11-01', description: '', category: 'y', amount: 1 })).status, 400);
    assert.strictEqual((await post({ date: '2026-11-01', description: 'x', category: 'y', amount: -5 })).status, 400);

    let report = await get('/api/reports');
    assert.strictEqual(report.grandTotal, 531);
    assert.deepStrictEqual(report.category.map((row) => [row.label.toLowerCase(), row.total]), [
      ['food', 406], ['bills', 100], ['transport', 25],
    ]);
    assert.deepStrictEqual(report.monthly, [
      { label: '2026-10', total: 120.1 },
      { label: '2026-11', total: 210.2 },
      { label: '2026-12', total: 200.7 },
    ]);

    report = await get('/api/reports?start=2026-11-01&end=2026-11-15');
    assert.strictEqual(report.grandTotal, 210.2);
    assert.deepStrictEqual(report.daily, [
      { label: '2026-11-01', total: 110.2 },
      { label: '2026-11-15', total: 100 },
    ]);
    assert.strictEqual((await get('/api/expenses?start=2026-11-01&end=2026-11-15')).length, 3);
    assert.strictEqual((await fetch(`${base}/api/reports?start=2026-12-01&end=2026-11-01`)).status, 400);

    const rows = await get('/api/expenses');
    assert.strictEqual((await fetch(`${base}/api/expenses/${rows[0].id}`, { method: 'DELETE' })).status, 200);
    assert.strictEqual((await get('/api/expenses')).length, 4);

    await cleanupClient.db(testDatabase).collection('expenses').insertOne({
      _id: 'legacy-expense-1', date: '2026-11-20', description: 'Legacy record',
      category: 'Other', amountCents: 100,
    });
    const legacy = (await get('/api/expenses')).find((row) => row.id === 'legacy-expense-1');
    assert.ok(legacy);
    assert.strictEqual((await fetch(`${base}/api/expenses/${legacy.id}`, { method: 'DELETE' })).status, 200);
    const repeatedDelete = await fetch(`${base}/api/expenses/${legacy.id}`, { method: 'DELETE' });
    assert.strictEqual(repeatedDelete.status, 200);
    assert.deepStrictEqual(await repeatedDelete.json(), { ok: true, deleted: false });
    assert.strictEqual((await get('/api/expenses')).length, 4);
    console.log('All tests passed.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    await cleanupClient.db(testDatabase).collection('expenses').deleteMany({});
    await cleanupClient.close();
  }
}

run().catch((error) => {
  console.error('Tests failed:', error.message);
  process.exitCode = 1;
});
