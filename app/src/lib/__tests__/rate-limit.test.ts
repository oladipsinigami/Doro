import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRateLimiter } from "../rate-limit.ts";

function fixedClock(start: number) {
  let now = start;
  return {
    now: () => now,
    advance: (seconds: number) => {
      now += seconds * 1000;
    },
  };
}

describe("createRateLimiter", () => {
  it("allows requests up to the limit", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    for (let i = 0; i < 3; i++) {
      const result = limiter.check("alice", clock.now());
      assert.equal(result.allowed, true, `request ${i + 1} should be allowed`);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    assert.equal(limiter.check("alice", clock.now()).allowed, true);
    assert.equal(limiter.check("alice", clock.now()).allowed, true);
    assert.equal(limiter.check("alice", clock.now()).allowed, false);
  });

  it("tracks each caller independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    assert.equal(limiter.check("alice", clock.now()).allowed, true);
    assert.equal(limiter.check("bob", clock.now()).allowed, true);
    assert.equal(limiter.check("alice", clock.now()).allowed, false);
  });

  it("allows requests again once the window has elapsed", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    assert.equal(limiter.check("alice", clock.now()).allowed, true);
    assert.equal(limiter.check("alice", clock.now()).allowed, false);

    clock.advance(61);

    assert.equal(limiter.check("alice", clock.now()).allowed, true);
  });

  it("reports seconds until the caller may retry", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    limiter.check("alice", clock.now());
    const blocked = limiter.check("alice", clock.now());

    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds !== undefined, "blocked result should carry a retry hint");
    assert.ok(blocked.retryAfterSeconds! > 0, "retry hint should be positive");
    assert.ok(
      blocked.retryAfterSeconds! <= 60,
      "retry hint should not exceed the window"
    );
  });

  it("does not let a caller evade the limit by changing key casing", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    assert.equal(limiter.check("Alice", clock.now()).allowed, true);
    assert.equal(limiter.check("alice", clock.now()).allowed, false);
    assert.equal(limiter.check("ALICE", clock.now()).allowed, false);
  });

  it("evicts callers so the key space cannot grow without bound", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    for (let i = 0; i < 100; i++) {
      limiter.check(`attacker-${i}`, clock.now());
    }

    assert.equal(limiter.size(), 100);

    // Past the window, a single request should reclaim the expired state
    // rather than allowing it to persist.
    clock.advance(120);
    limiter.check("attacker-0", clock.now());

    assert.equal(
      limiter.size(),
      1,
      "expired entries should be evicted on the next window"
    );
  });

  it("enforces the key ceiling when a flood exceeds it inside one window", () => {
    const limiter = createRateLimiter({
      limit: 5,
      windowMs: 60_000,
      maxKeys: 10,
    });
    const clock = fixedClock(1_000_000);

    for (let i = 0; i < 100; i++) {
      limiter.check(`attacker-${i}`, clock.now());
    }

    assert.ok(
      limiter.size() <= 10,
      `expected the ceiling to hold, got ${limiter.size()} entries`
    );
  });
});

describe("voucher issuance limiter", () => {
  it("mints one active voucher per tip, then refuses", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    assert.equal(limiter.check("tip:7", clock.now()).allowed, true);
    assert.equal(
      limiter.check("tip:7", clock.now()).allowed,
      false,
      "a second voucher for the same tip must be refused"
    );
  });

  it("does not let voucher limits bleed across tips", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    assert.equal(limiter.check("tip:7", clock.now()).allowed, true);
    assert.equal(limiter.check("tip:8", clock.now()).allowed, true);
  });

  it("permits a retry after the cooldown so a dropped transaction is recoverable", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    assert.equal(limiter.check("tip:7", clock.now()).allowed, true);
    clock.advance(61);
    assert.equal(limiter.check("tip:7", clock.now()).allowed, true);
  });

  it("drops a released reservation so a failed attempt does not burn the slot", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    const failedAttempt = limiter.reserve("tip:7:user", clock.now());
    assert.equal(failedAttempt.allowed, true);
    failedAttempt.release();

    const retry = limiter.reserve("tip:7:user", clock.now());
    assert.equal(retry.allowed, true);
  });

  it("holds a reservation that was not released", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    const issued = limiter.reserve("tip:7:user", clock.now());
    assert.equal(issued.allowed, true);

    const second = limiter.reserve("tip:7:user", clock.now());
    assert.equal(second.allowed, false);
    assert.ok(second.retryAfterSeconds && second.retryAfterSeconds > 0);
  });

  it("does not let an old release erase a reservation in a later window", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const clock = fixedClock(1_000_000);

    const stale = limiter.reserve("tip:7:user", clock.now());
    clock.advance(61);
    const current = limiter.reserve("tip:7:user", clock.now());
    assert.equal(current.allowed, true);

    stale.release();

    assert.equal(limiter.reserve("tip:7:user", clock.now()).allowed, false);
  });
});