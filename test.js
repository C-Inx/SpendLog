// test.js - quick end-to-end check of the API rules. Run: npm test
process.env.DB_PATH = ':memory:';
const assert = require('assert');
const app = require('./server');

const server = app.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const post = (b) => fetch(base + '/api/expenses', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const get = (u) => fetch(base + u).then((r) => r.json());

  try {
    const data = [
      ['2026-10-31', 'Rice', 'Food', 120.10],
      ['2026-11-01', 'Jeep', 'Transport', 25],
      ['2026-11-01', 'Lunch', 'food', 85.2],      // different case, same category
      ['2026-11-15', 'Load', 'Bills', 100],
      ['2026-12-02', 'Dinner', 'Food', 200.7],
    ];
    for (const [date, description, category, amount] of data)
      assert.strictEqual((await post({ date, description, category, amount })).status, 201);

    // validation
    assert.strictEqual((await post({ date: '2026-02-30', description: 'x', category: 'y', amount: 1 })).status, 400);
    assert.strictEqual((await post({ date: '2026-11-01', description: '', category: 'y', amount: 1 })).status, 400);
    assert.strictEqual((await post({ date: '2026-11-01', description: 'x', category: 'y', amount: -5 })).status, 400);
    assert.strictEqual((await post({ date: '2026-11-01', description: 'x', category: 'y', amount: 'abc' })).status, 400);

    // all-time reports
    let r = await get('/api/reports');
    assert.strictEqual(r.grandTotal, 531);
    assert.deepStrictEqual(r.category.map((x) => [x.label.toLowerCase(), x.total]),
      [['food', 406], ['bills', 100], ['transport', 25]]);
    assert.deepStrictEqual(r.monthly, [
      { label: '2026-10', total: 120.1 }, { label: '2026-11', total: 210.2 }, { label: '2026-12', total: 200.7 }]);

    // inclusive range: Nov 1 .. Nov 15 includes both boundary dates
    r = await get('/api/reports?start=2026-11-01&end=2026-11-15');
    assert.strictEqual(r.grandTotal, 210.2);
    assert.deepStrictEqual(r.daily, [{ label: '2026-11-01', total: 110.2 }, { label: '2026-11-15', total: 100 }]);
    assert.strictEqual((await get('/api/expenses?start=2026-11-01&end=2026-11-15')).length, 3);

    // bad ranges
    assert.strictEqual((await fetch(base + '/api/reports?start=2026-12-01&end=2026-11-01')).status, 400);
    assert.strictEqual((await fetch(base + '/api/reports?start=nope')).status, 400);

    // delete
    const list = await get('/api/expenses');
    assert.strictEqual((await fetch(`${base}/api/expenses/${list[0].id}`, { method: 'DELETE' })).status, 200);
    assert.strictEqual((await get('/api/expenses')).length, 4);

    console.log('All tests passed.');
  } catch (e) { console.error('FAILED:', e.message); process.exitCode = 1; }
  server.close();
});
