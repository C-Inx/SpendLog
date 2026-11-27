# SpendLog

A single-page full-stack expense tracker: add expenses, see them in one table,
and view exactly three reports (Category, Daily, Monthly), all controlled by one
inclusive date-range filter. No login, accounts, or passwords.

**Stack:** Node.js, Express, SQLite (better-sqlite3), vanilla HTML/CSS/JS.

## Run locally
```
npm install
npm start          # http://localhost:3000
npm test           # API checks
```

## Deploy (Render)
1. Push this folder to a GitHub repo.
2. Render -> New -> Web Service -> pick the repo.
3. Build command: `npm install`   Start command: `npm start`
4. Add a **Disk** (Advanced) mounted at `/data`, and set env var `DB_PATH=/data/spendlog.db`
   so expenses survive restarts. (Free instances have no disk; use a paid instance,
   or Railway/Fly.io with a volume.)

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/expenses?start=&end=` | Expense rows in range |
| POST | `/api/expenses` | Add `{date, description, category, amount}` |
| DELETE | `/api/expenses/:id` | Remove one expense |
| GET | `/api/reports?start=&end=` | Category, daily, monthly totals + grand total |
| GET | `/api/categories` | Distinct categories (for autocomplete) |

## Keeping it awake + data that survives (Render)
- **UptimeRobot:** add an HTTP(s) monitor for `https://<your-app>.onrender.com/health` every 5 minutes.
  This stops the free instance from sleeping, so the first load isn't slow.
- **"Database empty" after a while:** Render's free tier has an ephemeral filesystem, so the SQLite file
  is wiped on every restart/redeploy. Use a paid instance + Disk (`DB_PATH=/data/spendlog.db`), or move
  to a hosted database.
- **Frontend on Vercel, API on Render:** set `window.SPENDLOG_API` in `public/config.js` to the Render URL,
  and set `CORS_ORIGIN` on Render to your Vercel URL.
