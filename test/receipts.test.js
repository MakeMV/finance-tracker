import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createReceiptScanner, normalizeReceipt, ReceiptError } from '../src/receipts.js';
import { createRateLimiter } from '../src/rate-limit.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // bytes don't matter for the fake scanner

async function startServer(t, options) {
  const server = createApp(openDb(), options).listen(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/receipts`;
  return async (path, init) => {
    const res = await fetch(base + path, init);
    return { status: res.status, body: await res.json() };
  };
}

const scanJpeg = { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: JPEG };

/** Fake scanner: no network, no API key, records what it received. */
function fakeScanner(result) {
  const calls = [];
  return {
    calls,
    async scan(input) {
      calls.push(input);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

test('without a scanner the feature reports itself as off', async (t) => {
  const request = await startServer(t);
  assert.deepEqual((await request('/status')).body, { enabled: false });
  assert.equal((await request('/scan', scanJpeg)).status, 503);
});

test('scan sends the image to the scanner and returns the fields', async (t) => {
  const fields = { amount: 4590, date: '2026-11-20', category: 'Food', merchant: 'Magnum', description: 'Magnum: groceries', currency: 'KZT' };
  const scanner = fakeScanner(fields);
  const request = await startServer(t, { receiptScanner: scanner });

  assert.deepEqual((await request('/status')).body, { enabled: true });
  const res = await request('/scan', scanJpeg);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, fields);
  assert.equal(scanner.calls[0].mediaType, 'image/jpeg');
  assert.deepEqual(scanner.calls[0].data, JPEG);
});

test('scan rejects anything that is not an image', async (t) => {
  const request = await startServer(t, { receiptScanner: fakeScanner({}) });
  const res = await request('/scan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(res.status, 415);
});

test('a readable scanner error becomes a clear HTTP error', async (t) => {
  const request = await startServer(t, { receiptScanner: fakeScanner(new ReceiptError('Not a receipt', 422)) });
  const res = await request('/scan', scanJpeg);
  assert.equal(res.status, 422);
  assert.deepEqual(res.body, { error: 'Not a receipt' });
});

test('scans are rate limited', async (t) => {
  const request = await startServer(t, {
    receiptScanner: fakeScanner({ amount: 1 }),
    receiptLimiter: createRateLimiter({ perIpPerHour: 2 }),
  });
  assert.equal((await request('/scan', scanJpeg)).status, 200);
  assert.equal((await request('/scan', scanJpeg)).status, 200);
  assert.equal((await request('/scan', scanJpeg)).status, 429);
});

test('rate limiter: per-IP and daily limits, windows reset', () => {
  let clock = 0;
  const allow = createRateLimiter({ perIpPerHour: 2, perDay: 3, now: () => clock });
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), true);
  assert.equal(allow('a'), false); // a: hourly limit
  assert.equal(allow('b'), true);
  assert.equal(allow('c'), false); // server: daily limit
  clock += 25 * 60 * 60 * 1000;
  assert.equal(allow('a'), true);
});

test('normalizeReceipt cleans up what the model returns', () => {
  assert.deepEqual(
    normalizeReceipt({
      is_receipt: true, merchant: ' Small ', description: '', total: 1234.567,
      currency: 'kzt', date: '2026-02-30', category: 'Snacks',
    }),
    { amount: 1234.57, date: null, category: 'Other', merchant: 'Small', description: 'Small', currency: 'KZT' },
  );
  assert.equal(normalizeReceipt({ is_receipt: true, total: 0, date: '2026-11-01', category: 'Food' }).amount, null);
  assert.throws(() => normalizeReceipt({ is_receipt: false }), ReceiptError);
});

test('scanner builds the Claude request and parses the structured answer', async () => {
  let sent;
  const client = {
    beta: {
      messages: {
        async create(params) {
          sent = params;
          return {
            stop_reason: 'end_turn',
            content: [{
              type: 'text',
              text: JSON.stringify({
                is_receipt: true, merchant: 'Magnum', description: 'Magnum: groceries',
                total: 4590, currency: 'KZT', date: '2026-11-20', category: 'Food',
              }),
            }],
          };
        },
      },
    },
  };
  const result = await createReceiptScanner({ client }).scan({ mediaType: 'image/png', data: Buffer.from('img') });

  assert.equal(result.amount, 4590);
  assert.equal(result.category, 'Food');
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.output_config.format.type, 'json_schema');
  const image = sent.messages[0].content[0];
  assert.deepEqual(image.source, { type: 'base64', media_type: 'image/png', data: Buffer.from('img').toString('base64') });
});

test('scanner turns a refusal into a readable error', async () => {
  const client = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } };
  await assert.rejects(
    createReceiptScanner({ client }).scan({ mediaType: 'image/png', data: Buffer.from('x') }),
    ReceiptError,
  );
});
