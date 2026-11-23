import express, { Router } from 'express';
import { RECEIPT_MEDIA_TYPES, ReceiptError } from '../receipts.js';
import { createRateLimiter } from '../rate-limit.js';

/**
 * POST /api/receipts/scan — body is the image itself (Content-Type: image/jpeg, ...).
 * Returns the recognized fields; nothing is saved. The user checks them in the form first.
 * The image is only held in memory for the request and is never stored.
 */
export function receiptsRouter(scanner, limiter = createRateLimiter()) {
  const router = Router();

  router.get('/status', (req, res) => {
    res.json({ enabled: Boolean(scanner) });
  });

  router.post(
    '/scan',
    express.raw({ type: RECEIPT_MEDIA_TYPES, limit: '5mb' }),
    async (req, res, next) => {
      if (!scanner) {
        return res.status(503).json({ error: 'Receipt scanning is not configured on this server' });
      }
      const mediaType = req.get('Content-Type')?.split(';')[0].trim();
      if (!RECEIPT_MEDIA_TYPES.includes(mediaType) || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(415).json({ error: 'Send a JPEG, PNG, WebP or GIF image' });
      }
      if (!limiter(req.ip)) {
        return res.status(429).json({ error: 'Too many receipts scanned. Try again later.' });
      }

      try {
        res.json(await scanner.scan({ mediaType, data: req.body }));
      } catch (err) {
        if (err instanceof ReceiptError) return res.status(err.status).json({ error: err.message });
        next(err);
      }
    },
  );

  return router;
}
