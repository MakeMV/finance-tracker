// Demo data for the current and previous month.
// Used by `npm run seed` and by the server when SEED_DEMO=true (live demo).

import { toMinor } from './validation.js';

const DEMO = [
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

const pad = (n) => String(n).padStart(2, '0');

/** Date in the month `monthsAgo` months back; in the current month never later than today. */
function dateOf(now, monthsAgo, day) {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const lastDay = monthsAgo === 0
    ? now.getDate()
    : new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
}

/**
 * Insert demo transactions if the database is empty.
 * @returns {number} how many transactions were added (0 if there was data already)
 */
export function seedDemo(repo, now = new Date()) {
  if (repo.list().length > 0) return 0;

  let count = 0;
  for (const monthsAgo of [1, 0]) {
    for (const [type, amount, category, description, day] of DEMO) {
      // Previous month is 10% lower so the two months look different.
      const value = monthsAgo === 1 ? Math.round(amount * 0.9) : amount;
      repo.create({
        type, amount: toMinor(value), category, description, date: dateOf(now, monthsAgo, day),
      });
      count += 1;
    }
  }
  return count;
}
