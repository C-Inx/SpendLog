const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI must be configured.');

const client = new MongoClient(uri, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000,
});
const databaseName = process.env.MONGODB_DB || 'spendlog';
let connection;

async function expensesCollection() {
  if (!connection) {
    connection = client.connect().then(() => client.db(databaseName).collection('expenses'));
  }
  return connection;
}

const toMoney = (cents) => cents / 100;

async function listExpenses(start, end) {
  const filter = {};
  if (start || end) {
    filter.date = {};
    if (start) filter.date.$gte = start;
    if (end) filter.date.$lte = end;
  }

  const rows = await (await expensesCollection())
    .find(filter)
    .sort({ date: -1, _id: -1 })
    .toArray();
  return rows.map((row) => ({
    id: row._id.toString(),
    date: row.date,
    description: row.description,
    category: row.category,
    amount: toMoney(row.amountCents),
  }));
}

async function addExpense({ date, description, category, amountCents }) {
  const result = await (await expensesCollection()).insertOne({
    date,
    description,
    category,
    amountCents,
    createdAt: new Date(),
  });
  return result.insertedId.toString();
}

async function deleteExpense(id) {
  if (typeof id !== 'string' || !id || id.length > 128) return false;
  const identifiers = ObjectId.isValid(id) ? [new ObjectId(id), id] : [id];
  const result = await (await expensesCollection()).deleteOne({ _id: { $in: identifiers } });
  return result.deletedCount > 0;
}

function dateFilter(start, end) {
  if (!start && !end) return {};
  const date = {};
  if (start) date.$gte = start;
  if (end) date.$lte = end;
  return { date };
}

async function reports(start, end) {
  const collection = await expensesCollection();
  const filter = dateFilter(start, end);
  const [category, daily, monthly, total] = await Promise.all([
    collection.aggregate([
      { $match: filter },
      { $group: { _id: { $toLower: '$category' }, label: { $min: '$category' }, cents: { $sum: '$amountCents' } } },
      { $sort: { cents: -1, _id: 1 } },
      { $project: { _id: 0, label: 1, total: { $divide: ['$cents', 100] } } },
    ]).toArray(),
    collection.aggregate([
      { $match: filter },
      { $group: { _id: '$date', cents: { $sum: '$amountCents' } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, label: '$_id', total: { $divide: ['$cents', 100] } } },
    ]).toArray(),
    collection.aggregate([
      { $match: filter },
      { $group: { _id: { $substrCP: ['$date', 0, 7] }, cents: { $sum: '$amountCents' } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, label: '$_id', total: { $divide: ['$cents', 100] } } },
    ]).toArray(),
    collection.aggregate([
      { $match: filter },
      { $group: { _id: null, cents: { $sum: '$amountCents' } } },
    ]).toArray(),
  ]);

  return {
    category,
    daily,
    monthly,
    grandTotal: toMoney(total[0]?.cents || 0),
  };
}

async function categories() {
  const collection = await expensesCollection();
  return collection.aggregate([
    { $group: { _id: { $toLower: '$category' }, category: { $min: '$category' } } },
    { $sort: { category: 1 } },
    { $project: { _id: 0, category: 1 } },
  ]).toArray().then((rows) => rows.map((row) => row.category));
}

async function close() {
  if (connection) {
    await client.close();
    connection = undefined;
  }
}

module.exports = { listExpenses, addExpense, deleteExpense, reports, categories, close };
