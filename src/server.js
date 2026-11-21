import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || 'data/finance.db';

mkdirSync(dirname(DB_FILE), { recursive: true });
const db = openDb(DB_FILE);
const app = createApp(db);

const server = app.listen(PORT, () => {
  console.log(`Finance Tracker running at http://localhost:${PORT}`);
});

// Close the database cleanly on Ctrl+C or when the host stops the container.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
