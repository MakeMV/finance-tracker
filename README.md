# 💰 Finance Tracker

[![CI](https://github.com/MakeMV/finance-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/MakeMV/finance-tracker/actions/workflows/ci.yml)

A fullstack app for tracking **income and expenses**: a REST API on **Node.js + Express + SQLite**
and a responsive frontend in **vanilla JavaScript**.

![Screenshot of Finance Tracker](docs/screenshot.jpg)

## Features

- ➕ Add, ✏️ edit and 🗑️ delete transactions
- 📅 Browse by month: income, expenses and balance for each month
- 📊 Expenses broken down by category
- 🔎 Filter the list by type (income / expenses)
- ✅ Server-side validation with clear error messages
- 🌗 Light & dark theme, 📱 responsive layout

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 5 |
| Database | SQLite (built-in `node:sqlite`, no native dependencies) |
| Frontend | HTML, CSS (Grid, custom properties), vanilla JavaScript (ES modules, Fetch API) |
| Tests | Node.js built-in test runner (`node:test`) |
| DevOps | Docker, GitHub Actions (tests on Node 24 & 26, Docker build + smoke test) |

## Getting started

Requires **Node.js 22.13+** (24 or newer recommended).

```bash
git clone https://github.com/MakeMV/finance-tracker.git
cd finance-tracker
npm install
npm run seed   # optional: add demo data
npm start
```

Open http://localhost:3000.

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with auto-restart on file changes |
| `npm test` | Run the API tests |
| `npm run seed` | Fill the database with demo transactions |

### With Docker

```bash
docker build -t finance-tracker .
docker run -p 3000:3000 -v finance-data:/app/data finance-tracker
```

The `-v` volume keeps your data when the container is restarted.

### Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_FILE` | `data/finance.db` | Path to the SQLite database file |
| `SEED_DEMO` | — | Set to `true` to fill an empty database with demo data on start |

### Deploy to Render

The repo includes a [`render.yaml`](render.yaml) Blueprint: in the Render dashboard choose
**New → Blueprint**, pick this repository and click **Apply**. It builds the Dockerfile on the free plan.

> The free plan has no persistent disk, so the database resets when the service restarts.
> `SEED_DEMO=true` refills it with demo data, which is fine for a portfolio demo.

## API

All endpoints are under `/api` and use JSON.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/categories` | Income and expense categories |
| `GET` | `/api/transactions?month=2026-11&type=expense&category=Food` | List transactions (all filters optional) |
| `GET` | `/api/transactions/:id` | Get one transaction |
| `POST` | `/api/transactions` | Create a transaction → `201` |
| `PUT` | `/api/transactions/:id` | Update a transaction |
| `DELETE` | `/api/transactions/:id` | Delete a transaction → `204` |
| `GET` | `/api/summary?month=2026-11` | Income, expenses, balance and expenses by category |

Example:

```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{"type":"expense","amount":2500,"category":"Food","description":"Lunch","date":"2026-11-21"}'
```

Invalid data returns `400` with a list of problems:

```json
{ "errors": ["amount must be a positive number", "date must be a valid date in YYYY-MM-DD format"] }
```

## Project structure

```
finance-tracker/
├── src/
│   ├── server.js        # Entry point: opens the DB, starts HTTP server, graceful shutdown
│   ├── app.js           # Express app: middleware, routes, error handling
│   ├── routes/api.js    # REST endpoints
│   ├── repository.js    # All SQL queries (parameterized)
│   ├── validation.js    # Input validation, money conversion
│   ├── categories.js    # Category lists
│   └── db.js            # SQLite connection and schema
├── public/              # Frontend (served as static files)
├── test/api.test.js     # API tests
├── scripts/seed.js      # Demo data
└── Dockerfile
```

## Design decisions

- **Money is stored as integers** (tiyn / cents): `12.34 ₸` → `1234`. Floating-point numbers can't
  represent most decimals exactly (`0.1 + 0.2 = 0.30000000000000004`), so totals would drift. A test checks this.
- **Parameterized SQL** everywhere (`WHERE id = ?`), so user input can never change a query (no SQL injection).
- **Layered backend**: routes → validation → repository → database. Each layer has one job and can be tested separately.
- **The database is injected into the app** (`createApp(db)`), so every test runs against its own fresh in-memory database.
- **The frontend never uses `innerHTML`** for user data, which prevents XSS.

## Roadmap

- [ ] User accounts and authentication (JWT)
- [ ] Monthly budgets per category with warnings
- [ ] Export to CSV
- [ ] Charts for trends over several months

## License

[MIT](LICENSE) © YerMukhammed Zadakhanov
