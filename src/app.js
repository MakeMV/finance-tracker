import express from 'express';
import { fileURLToPath } from 'node:url';
import { createRepository } from './repository.js';
import { apiRouter } from './routes/api.js';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

/**
 * Build the Express app. The database is passed in (dependency injection),
 * so tests can use a fresh in-memory database.
 */
export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');

  app.use(express.json({ limit: '10kb' }));
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
