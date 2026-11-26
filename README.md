# SpendLog

A single-page full-stack expense tracker: add expenses, see them in one table,
and view exactly three reports (Category, Daily, Monthly), all controlled by one
inclusive date-range filter. Expenses are stored in MongoDB Atlas.

**Stack:** Node.js, Express, MongoDB Atlas, vanilla HTML/CSS/JS.

## Run locally

```sh
npm install
MONGODB_URI="mongodb+srv://..." npm start
npm test
```

`MONGODB_URI` is server-only. The app uses the `spendlog` database by default;
set `MONGODB_DB` to choose another database.

## Deploy to Vercel

1. Keep the Vercel project root directory at the repository root.
2. Add `MONGODB_URI` in the project environment variables for Preview and Production.
   Use a rotated Atlas database-user password, not credentials shared in chat.
3. Deploy the connected Git branch. Vercel serves the static frontend and the
   Express API function from `api/[...path].js`.
4. In Atlas Network Access, allow connections from the Vercel deployment environment.
   Prefer a narrowly scoped network policy where your hosting setup supports it.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/expenses?start=&end=` | Expense rows in range |
| POST | `/api/expenses` | Add `{date, description, category, amount}` |
| DELETE | `/api/expenses/:id` | Remove one expense |
| GET | `/api/reports?start=&end=` | Category, daily, monthly totals + grand total |
| GET | `/api/categories` | Distinct categories (for autocomplete) |
