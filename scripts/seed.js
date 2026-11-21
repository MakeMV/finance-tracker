// Fill the database with demo data for the current and previous month.
// Usage: npm run seed

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from '../src/db.js';
import { createRepository } from '../src/repository.js';
import { toMinor } from '../src/validation.js';

const DB_FILE = process.env.DB_FILE || 'data/finance.db';
mkdirSync(dirname(DB_FILE), { recursive: true });
const repo = createRepository(openDb(DB_FILE));

if (repo.list().length > 0) {
  console.log('Database already has data, skipping seed.');
  process.exit(0);
}

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();

/** Date in the month `monthsAgo` months back, clamped to today for the current month. */
function dateOf(monthsAgo, day) {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const lastDay = monthsAgo === 0 ? now.getDate() : new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
}

const demo = [
  ['income', 450000, 'Salary', 'Monthly salary', 1],
  ['income', 60000, 'Freelance', 'Landing page for a client', 12],
  ['expense', 150000, 'Housing', 'Rent', 2],
  ['expense', 18500, 'Utilities', 'Electricity & water', 5],
  ['expense', 6990, 'Utilities', 'Internet', 5],
  ['expense', 24300, 'Food', 'Groceries', 3],
  ['expense', 19850, 'Food', 'Groceries', 10],
  ['expense', 4500, 'Food', 'Lunch with friends', 14],
  ['expense', 8000, 'Transport', 'Bus pass', 1],
  ['expense', 3200, 'Transport', 'Taxi', 9],
  ['expense', 12000, 'Entertainment', 'Cinema & dinner', 8],
  ['expense', 25000, 'Education', 'Online JavaScript course', 4],
  ['expense', 7500, 'Health', 'Pharmacy', 11],
  ['expense', 32000, 'Shopping', 'Winter jacket', 7],
];

let count = 0;
for (const monthsAgo of [1, 0]) {
  for (const [type, amount, category, description, day] of demo) {
    // Vary the previous month a little so the two months look different.
    const value = monthsAgo === 1 ? Math.round(amount * 0.9) : amount;
    repo.create({ type, amount: toMinor(value), category, description, date: dateOf(monthsAgo, day) });
    count += 1;
  }
}

console.log(`Seeded ${count} transactions into ${DB_FILE}.`);
