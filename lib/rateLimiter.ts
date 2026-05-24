type Bucket = {
  tokens: number;
  lastRefill: number; // epoch ms
};

const store = new Map<string, Bucket>();

const DEFAULT_RATE_PER_MIN = Number(process.env.GEMINI_RATE_LIMIT_PER_MIN) || 20;

export function checkRateLimit(key: string, perMinute = DEFAULT_RATE_PER_MIN) {
  const now = Date.now();
  const windowMs = 60_000;
  const bucket = store.get(key) || { tokens: perMinute, lastRefill: now };

  // refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    const refill = (elapsed / windowMs) * perMinute;
    bucket.tokens = Math.min(perMinute, bucket.tokens + refill);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    store.set(key, bucket);
    const remaining = Math.floor(bucket.tokens);
    const resetSeconds = Math.ceil((windowMs - (now - bucket.lastRefill)) / 1000);
    return { allowed: true, remaining, resetSeconds };
  }

  // not allowed
  store.set(key, bucket);
  const resetSeconds = Math.ceil((windowMs - (now - bucket.lastRefill)) / 1000);
  return { allowed: false, remaining: 0, resetSeconds };
}

// cleanup stale buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [k, v] of store.entries()) {
    if (v.lastRefill < cutoff) store.delete(k);
  }
}, 5 * 60_000).unref?.();
