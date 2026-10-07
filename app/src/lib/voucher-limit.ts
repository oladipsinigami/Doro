import { createRateLimiter, VOUCHER_COOLDOWN_MS } from "./rate-limit";

/**
 * Claim-path limiters.
 *
 * The claim path is external-wallet only: X login proves the handle, the
 * recipient's own wallet receives the MON and pays the gas. There is no
 * embedded-wallet claim route, so one voucher limiter is the whole surface.
 *
 * Still one map inside one Node process. A second server process has its own
 * map and would undercount. See SECURITY-DEBT SD-06.
 */
export const voucherLimiter = createRateLimiter({
  limit: 1,
  windowMs: VOUCHER_COOLDOWN_MS,
});

/** Broad ceiling on claim attempts per raw access token. */
export const identityLimiter = createRateLimiter({
  limit: 10,
  windowMs: VOUCHER_COOLDOWN_MS,
});
