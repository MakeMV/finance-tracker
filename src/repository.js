// All SQL lives here. Routes never touch the database directly.
// Every query uses "?" placeholders: values are passed separately,
// so user input can never change the SQL itself (no SQL injection).

import { fromMinor } from './validation.js';

/** DB row → API object (amount back to normal units). */
const toApi = (row) => ({
  id: row.id,
  type: row.type,
  amount: fromMinor(row.amount),
  category: row.category,
  description: row.description,
  date: row.date,
});

/** "2026-11" → ['2026-11-01', '2026-11-31']. Plain string comparison works for ISO dates. */
const monthRange = (month) => [`${month}-01`, `${month}-31`];

export function createRepository(db) {
  const statements = {
    get: db.prepare('SELECT * FROM transactions WHERE id = ?'),
    insert: db.prepare(`
      INSERT INTO transactions (type, amount, category, description, date)
      VALUES (?, ?, ?, ?, ?)`),
    update: db.prepare(`
      UPDATE transactions
      SET type = ?, amount = ?, category = ?, description = ?, date = ?
      WHERE id = ?`),
    remove: db.prepare('DELETE FROM transactions WHERE id = ?'),
    totals: db.prepare(`
      SELECT type, SUM(amount) AS total
      FROM transactions
      WHERE date BETWEEN ? AND ?
      GROUP BY type`),
    byCategory: db.prepare(`
      SELECT category, SUM(amount) AS total
      FROM transactions
      WHERE type = 'expense' AND date BETWEEN ? AND ?
      GROUP BY category
      ORDER BY total DESC`),
  };

  return {
    /** List transactions, newest first, with optional filters. */
    list({ month, type, category } = {}) {
      const where = [];
      const params = [];
      if (month) {
        where.push('date BETWEEN ? AND ?');
        params.push(...monthRange(month));
      }
      if (type) {
        where.push('type = ?');
        params.push(type);
      }
      if (category) {
        where.push('category = ?');
        params.push(category);
      }
      const sql = `
        SELECT * FROM transactions
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY date DESC, id DESC`;
      return db.prepare(sql).all(...params).map(toApi);
    },

    get(id) {
      const row = statements.get.get(id);
      return row ? toApi(row) : null;
    },

    create(tx) {
      const { lastInsertRowid } = statements.insert.run(
        tx.type, tx.amount, tx.category, tx.description, tx.date,
      );
      return this.get(Number(lastInsertRowid));
    },

    /** @returns the updated transaction, or null if it doesn't exist */
    update(id, tx) {
      const { changes } = statements.update.run(
        tx.type, tx.amount, tx.category, tx.description, tx.date, id,
      );
      return changes ? this.get(id) : null;
    },

    /** @returns true if something was deleted */
    remove(id) {
      return statements.remove.run(id).changes > 0;
    },

    /** Income, expenses, balance and expenses by category for one month. */
    summary(month) {
      const range = monthRange(month);
      const totals = { income: 0, expense: 0 };
      for (const row of statements.totals.all(...range)) totals[row.type] = row.total;

      return {
        month,
        income: fromMinor(totals.income),
        expense: fromMinor(totals.expense),
        // Subtract in minor units, then convert: keeps the result exact.
        balance: fromMinor(totals.income - totals.expense),
        byCategory: statements.byCategory.all(...range).map((row) => ({
          category: row.category,
          total: fromMinor(row.total),
        })),
      };
    },
  };
}
