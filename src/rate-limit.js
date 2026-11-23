/**
 * Tiny in-memory rate limiter (fixed windows), so a public demo can't burn the API budget.
 * Two limits: per client IP per hour, and for the whole server per day.
 * In memory is enough for a single instance; several instances would need Redis.
 */
export function createRateLimiter({ perIpPerHour = 10, perDay = 50, now = Date.now } = {}) {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const perIp = new Map(); // ip → { count, resetAt }
  let daily = { count: 0, resetAt: 0 };

  function hit(counter, limit, windowMs) {
    const t = now();
    if (t >= counter.resetAt) {
      counter.count = 0;
      counter.resetAt = t + windowMs;
    }
    if (counter.count >= limit) return false;
    counter.count += 1;
    return true;
  }

  return function allow(ip) {
    const t = now();
    // Forget expired entries so the map can't grow forever.
    for (const [key, counter] of perIp) if (t >= counter.resetAt) perIp.delete(key);

    if (!perIp.has(ip)) perIp.set(ip, { count: 0, resetAt: 0 });
    const ipCounter = perIp.get(ip);
    if (ipCounter.count >= perIpPerHour && t < ipCounter.resetAt) return false;
    if (!hit(daily, perDay, DAY)) return false;
    return hit(ipCounter, perIpPerHour, HOUR);
  };
}
