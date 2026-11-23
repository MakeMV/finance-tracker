import express from 'express';
import { fileURLToPath } from 'node:url';
import { createRepository } from './repository.js';
import { apiRouter } from './routes/api.js';
import { receiptsRouter } from './routes/receipts.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

/**
 * Build the Express app. The database and the receipt scanner are passed in
 * (dependency injection), so tests can use an in-memory database and a fake scanner.
 * Without a scanner, receipt scanning is simply turned off.
 */
export function createApp(db, { receiptScanner = null, receiptLimiter } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind Render's proxy: take the client IP from X-Forwarded-For (used by the rate limiter).
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '10kb' }));
  app.use('/api/receipts', receiptsRouter(receiptScanner, receiptLimiter));
  app.use('/api', apiRouter(createRepository(db)));
  app.use(express.static(publicDir));

  // Unknown API route → JSON 404 (instead of an HTML page).
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Central error handler: must have 4 arguments for Express to treat it as one.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ errors: ['Request body must be valid JSON'] });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ errors: ['Request body is too large'] });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
