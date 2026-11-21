import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

/** Start the app on a random free port with a fresh in-memory database. */
async function startServer(t) {
  const server = createApp(openDb()).listen(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;

  return async function request(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
}

const lunch = {
  type: 'expense', amount: 2500, category: 'Food', description: 'Lunch', date: '2026-11-10',
};

test('POST creates a transaction and GET returns it', async (t) => {
  const request = await startServer(t);

  const created = await request('POST', '/transactions', lunch);
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { id: 1, ...lunch });

  const fetched = await request('GET', '/transactions/1');
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.body, created.body);
});

test('POST rejects invalid data with a list of errors', async (t) => {
  const request = await startServer(t);

  const res = await request('POST', '/transactions', {
    type: 'gift', amount: -5, category: 'Food', date: '2026-02-30',
  });
  assert.equal(res.status, 400);
  assert.ok(res.body.errors.some((e) => e.startsWith('type')));
  assert.ok(res.body.errors.some((e) => e.startsWith('amount')));
  assert.ok(res.body.errors.some((e) => e.startsWith('date')));
});

test('POST rejects a category that does not match the type', async (t) => {
  const request = await startServer(t);
  const res = await request('POST', '/transactions', { ...lunch, category: 'Salary' });
  assert.equal(res.status, 400);
  assert.match(res.body.errors[0], /category must be one of/);
});

test('POST rejects more than 2 decimal places', async (t) => {
  const request = await startServer(t);
  const res = await request('POST', '/transactions', { ...lunch, amount: 10.555 });
  assert.equal(res.status, 400);
});

test('POST with malformed JSON returns 400, not 500', async (t) => {
  const request = await startServer(t);
  const res = await request('POST', '/transactions', '{"type": ');
  assert.equal(res.status, 400);
});

test('GET /transactions filters by month and type', async (t) => {
  const request = await startServer(t);
  await request('POST', '/transactions', lunch);
  await request('POST', '/transactions', { ...lunch, date: '2026-10-31' });
  await request('POST', '/transactions', {
    type: 'income', amount: 500000, category: 'Salary', date: '2026-11-05',
  });

  const november = await request('GET', '/transactions?month=2026-11');
  assert.equal(november.body.length, 2);
  assert.equal(november.body[0].date, '2026-11-10', 'newest first');

  const novemberExpenses = await request('GET', '/transactions?month=2026-11&type=expense');
  assert.equal(novemberExpenses.body.length, 1);

  const bad = await request('GET', '/transactions?month=2026-13');
  assert.equal(bad.status, 400);
});

test('PUT updates and DELETE removes a transaction', async (t) => {
  const request = await startServer(t);
  await request('POST', '/transactions', lunch);

  const updated = await request('PUT', '/transactions/1', { ...lunch, amount: 3000 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.amount, 3000);

  assert.equal((await request('DELETE', '/transactions/1')).status, 204);
  assert.equal((await request('GET', '/transactions/1')).status, 404);
  assert.equal((await request('DELETE', '/transactions/1')).status, 404);
  assert.equal((await request('PUT', '/transactions/1', lunch)).status, 404);
});

test('summary totals are exact for decimal amounts', async (t) => {
  const request = await startServer(t);
  // With floats, 0.1 + 0.2 = 0.30000000000000004. Integer storage keeps it exact.
  await request('POST', '/transactions', { ...lunch, amount: 0.1 });
  await request('POST', '/transactions', { ...lunch, amount: 0.2, category: 'Transport' });
  await request('POST', '/transactions', {
    type: 'income', amount: 1000, category: 'Salary', date: '2026-11-01',
  });

  const res = await request('GET', '/summary?month=2026-11');
  assert.equal(res.status, 200);
  assert.equal(res.body.income, 1000);
  assert.equal(res.body.expense, 0.3);
  assert.equal(res.body.balance, 999.7);
  assert.deepEqual(res.body.byCategory, [
    { category: 'Transport', total: 0.2 },
    { category: 'Food', total: 0.1 },
  ]);
});

test('summary requires a valid month', async (t) => {
  const request = await startServer(t);
  assert.equal((await request('GET', '/summary')).status, 400);
});

test('unknown API routes return JSON 404', async (t) => {
  const request = await startServer(t);
  const res = await request('GET', '/nope');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Not found' });
});
