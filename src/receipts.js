import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES } from './categories.js';
import { isValidDate } from './validation.js';

export const RECEIPT_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const SYSTEM_PROMPT = `You read photos of shopping receipts for a personal finance app.
Receipts are usually from Kazakhstan, printed in Russian or Kazakh, with amounts in tenge (₸, тг, KZT).

Extract:
- total: the final amount paid (look for ИТОГО, К ОПЛАТЕ, БАРЛЫҒЫ, TOTAL). Not a subtotal, not the change (СДАЧА), not cash given.
- date: the purchase date as YYYY-MM-DD. Receipts usually print dates as DD.MM.YYYY or DD.MM.YY.
- merchant: the store or company name as printed.
- description: a short label for the transaction, at most 60 characters, e.g. "Magnum: groceries".
- currency: ISO code such as KZT, RUB, USD.
- category: the one expense category that fits best.

Use an empty string or 0 for anything you cannot read. Never guess numbers that are not on the receipt.
If the image is not a receipt, set is_receipt to false.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    is_receipt: { type: 'boolean' },
    merchant: { type: 'string' },
    description: { type: 'string' },
    total: { type: 'number' },
    currency: { type: 'string' },
    date: { type: 'string' },
    category: { type: 'string', enum: CATEGORIES.expense },
  },
  required: ['is_receipt', 'merchant', 'description', 'total', 'currency', 'date', 'category'],
  additionalProperties: false,
};

/** Error with a message that is safe to show to the user. */
export class ReceiptError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Turn the model's raw answer into clean values for the transaction form.
 * The model is not trusted blindly: every field is checked again here.
 */
export function normalizeReceipt(raw) {
  if (!raw || raw.is_receipt !== true) {
    throw new ReceiptError("This doesn't look like a receipt. Try a clearer photo.", 422);
  }
  const total = Number(raw.total);
  const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

  return {
    amount: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : null,
    date: isValidDate(raw.date) ? raw.date : null,
    category: CATEGORIES.expense.includes(raw.category) ? raw.category : 'Other',
    merchant: text(raw.merchant, 100),
    description: text(raw.description, 200) || text(raw.merchant, 200),
    currency: text(raw.currency, 3).toUpperCase(),
  };
}

/**
 * Receipt scanner backed by Claude's vision.
 * `client` can be replaced in tests; by default it reads ANTHROPIC_API_KEY.
 */
export function createReceiptScanner({
  client = new Anthropic(),
  model = process.env.RECEIPT_MODEL || 'claude-opus-5-5',
} = {}) {
  return {
    async scan({ mediaType, data }) {
      let response;
      try {
        response = await client.beta.messages.create({
          model,
          max_tokens: 16000,
          // Reading a receipt is a simple task: low effort keeps it fast and cheap.
          output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
          // If the model declines a request, the API retries it on a fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: data.toString('base64') } },
              { type: 'text', text: 'Extract the data from this receipt.' },
            ],
          }],
        });
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) {
          throw new ReceiptError('The recognition service is busy. Try again in a minute.', 503);
        }
        if (err instanceof Anthropic.BadRequestError) {
          console.error('Receipt scan rejected:', err.message);
          throw new ReceiptError('Could not process this image. Try a JPEG or PNG photo.', 422);
        }
        throw err; // auth/config problems: logged by the central error handler
      }

      if (response.stop_reason === 'refusal') {
        throw new ReceiptError('Could not read this image.', 422);
      }
      const text = response.content.find((block) => block.type === 'text')?.text;
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new ReceiptError('Could not read the receipt. Try a clearer photo.', 422);
      }
      return normalizeReceipt(raw);
    },
  };
}
