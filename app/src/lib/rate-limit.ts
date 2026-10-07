export type RateLimitConfig = {
  /** Requests permitted per window, per key. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum retained keys; oldest windows are evicted first. */
  maxKeys?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the key may retry. Only set when blocked. */
  retryAfterSeconds?: number;
};

export type Reservation = RateLimitResult & {
  /**
   * Give the slot back. Call this when the attempt did not produce a voucher,
   * so a validation failure or a signing error does not lock the recipient out.
   */
  release: () => void;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const DEFAULT_MAX_KEYS = 10_000;

/**
 * In-memory fixed-window rate limiter.
 *
 * Backing store is deliberately injectable in spirit: this implementation is
 * process-local, so it is correct for a single instance and *undercounts*
 * behind more than one. See `assertSharedStoreRequired` below.
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { limit, windowMs, maxKeys = DEFAULT_MAX_KEYS } = config;

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("rate limit must be a positive integer");
  }
  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error("rate limit window must be positive");
  }

  const buckets = new Map<string, Bucket>();
  let lastSweep = 0;

  function evictExpired(now: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }

  function evictOverflow() {
    while (buckets.size > maxKeys) {
      const oldest = buckets.keys().next();
      if (oldest.done) break;
      buckets.delete(oldest.value);
    }
  }

  function check(rawKey: string, now: number = Date.now()): RateLimitResult {
    const key = rawKey.trim().toLowerCase();

    // Amortized sweep: at most once per window, so expired keys cannot be used
    // to inflate state below the overflow ceiling.
    if (now - lastSweep >= windowMs) {
      evictExpired(now);
      lastSweep = now;
    }

    // Cheap on every call: normally zero iterations, so distinct-key floods
    // cannot push the map past its ceiling within a single window.
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      // Trim after insert so the ceiling holds at all times.
      evictOverflow();
      return { allowed: true };
    }

    if (existing.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    }

    existing.count += 1;
    evictOverflow();
    return { allowed: true };
  }

  function reserve(rawKey: string, now: number = Date.now()): Reservation {
    const key = rawKey.trim().toLowerCase();
    const result = check(rawKey, now);
    if (!result.allowed) {
      return { ...result, release: () => {} };
    }

    // check() just wrote this bucket. Release must touch that window only,
    // never a later one that replaced it after the cooldown.
    const reservedResetAt = buckets.get(key)?.resetAt;
    let released = false;

    return {
      allowed: true,
      release: () => {
        if (released) return;
        released = true;
        const bucket = buckets.get(key);
        if (!bucket || bucket.resetAt !== reservedResetAt) return;
        bucket.count -= 1;
        if (bucket.count <= 0) buckets.delete(key);
      },
    };
  }

  return {
    check,
    reserve,
    size: () => buckets.size,
    reset: () => buckets.clear(),
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/**
 * Per-tip voucher issuance limit.
 *
 * The contract already rejects a second `claim` for the same tipId, so extra
 * vouchers are worthless to a legitimate recipient and pure attack surface to
 * a compromised signer. One active voucher per tip, per cooldown window.
 */
export const VOUCHER_COOLDOWN_MS = 60_000;