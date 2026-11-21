// Fill the database with demo data for the current and previous month.
// Usage: npm run seed

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from '../src/db.js';
import { createRepository } from '../src/repository.js';
import { seedDemo } from '../src/seed.js';

const DB_FILE = process.env.DB_FILE || 'data/finance.db';
mkdirSync(dirname(DB_FILE), { recursive: true });

const count = seedDemo(createRepository(openDb(DB_FILE)));
console.log(count
  ? `Seeded ${count} transactions into ${DB_FILE}.`
  : 'Database already has data, skipping seed.');
