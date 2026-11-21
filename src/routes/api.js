import { Router } from 'express';
import { CATEGORIES } from '../categories.js';
import { validateTransaction, isValidMonth } from '../validation.js';

/** Parse ":id" from the URL; returns null if it's not a positive integer. */
function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function apiRouter(repo) {
  const router = Router();

  router.get('/categories', (req, res) => {
    res.json(CATEGORIES);
  });

  // GET /api/transactions?month=2026-11&type=expense&category=Food
  router.get('/transactions', (req, res) => {
    const { month, type, category } = req.query;
    if (month !== undefined && !isValidMonth(month)) {
      return res.status(400).json({ errors: ['month must be in YYYY-MM format'] });
    }
    if (type !== undefined && type !== 'income' && type !== 'expense') {
      return res.status(400).json({ errors: ['type must be "income" or "expense"'] });
    }
    res.json(repo.list({ month, type, category }));
  });

  router.get('/transactions/:id', (req, res) => {
    const id = parseId(req.params.id);
    const tx = id && repo.get(id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json(tx);
  });

  router.post('/transactions', (req, res) => {
    const { errors, value } = validateTransaction(req.body);
    if (errors.length) return res.status(400).json({ errors });
    const created = repo.create(value);
    res.status(201).location(`/api/transactions/${created.id}`).json(created);
  });

  router.put('/transactions/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: 'Transaction not found' });
    const { errors, value } = validateTransaction(req.body);
    if (errors.length) return res.status(400).json({ errors });
    const updated = repo.update(id, value);
    if (!updated) return res.status(404).json({ error: 'Transaction not found' });
    res.json(updated);
  });

  router.delete('/transactions/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id || !repo.remove(id)) return res.status(404).json({ error: 'Transaction not found' });
    res.status(204).end();
  });

  // GET /api/summary?month=2026-11
  router.get('/summary', (req, res) => {
    const { month } = req.query;
    if (!isValidMonth(month)) {
      return res.status(400).json({ errors: ['month is required, in YYYY-MM format'] });
    }
    res.json(repo.summary(month));
  });

  return router;
}
