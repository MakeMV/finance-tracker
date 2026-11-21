import { CATEGORIES } from './categories.js';

const MAX_AMOUNT = 1_000_000_000_000; // 1 trillion, a sanity limit
const MAX_DESCRIPTION = 200;

/** "2026-11-21" → true only if it is a real calendar date. */
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  // Rejects things like 2026-02-30, which Date would silently roll over to March 2.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** "2026-11" → true */
export function isValidMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Converts 12.34 → 1234. Money is stored as integers to avoid float errors (0.1 + 0.2 !== 0.3). */
export const toMinor = (amount) => Math.round(amount * 100);
export const fromMinor = (minor) => minor / 100;

/**
 * Validate a transaction payload from the client.
 * @returns {{ errors: string[], value?: object }} value has amount in minor units
 */
export function validateTransaction(body) {
  const errors = [];
  const { type, amount, category, description = '', date } = body ?? {};

  if (type !== 'income' && type !== 'expense') {
    errors.push('type must be "income" or "expense"');
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    errors.push('amount must be a positive number');
  } else if (Math.abs(amount * 100 - toMinor(amount)) > 1e-6) {
    errors.push('amount can have at most 2 decimal places');
  } else if (amount > MAX_AMOUNT) {
    errors.push('amount is too large');
  }

  const allowed = CATEGORIES[type] ?? [];
  if (!allowed.includes(category)) {
    errors.push(
      allowed.length
        ? `category must be one of: ${allowed.join(', ')}`
        : 'category is required',
    );
  }

  if (typeof description !== 'string') {
    errors.push('description must be a string');
  } else if (description.trim().length > MAX_DESCRIPTION) {
    errors.push(`description must be at most ${MAX_DESCRIPTION} characters`);
  }

  if (!isValidDate(date)) {
    errors.push('date must be a valid date in YYYY-MM-DD format');
  }

  if (errors.length) return { errors };

  return {
    errors,
    value: { type, amount: toMinor(amount), category, description: description.trim(), date },
  };
}
