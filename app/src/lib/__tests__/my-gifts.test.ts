import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_SCAN, expiryLabel, findMyGifts, type ScannableTip } from "../my-gifts.ts";
import { ZERO_ADDRESS } from "../gift-status.ts";

const MINE = "0x" + "a".repeat(64);
const THEIRS = "0x" + "b".repeat(64);
const NOW = 1_800_000_000;

function tip(over: Partial<ScannableTip> & { tipId: number }): ScannableTip {
  return {
    sender: "0x1111111111111111111111111111111111111111",
    createdAt: NOW - 1000,
    expiresAt: NOW + 7 * 86_400,
    claimed: false,
    claimedBy: ZERO_ADDRESS,
    amount: 100_000_000_000_000_000n,
    handleHash: MINE,
    ...over,
  };
}

describe("findMyGifts", () => {
  it("returns an open gift that carries my handle hash", () => {
    const result = findMyGifts([tip({ tipId: 4 })], MINE, NOW);

    assert.equal(result.gifts.length, 1);
    assert.equal(result.gifts[0].tipId, 4);
    assert.equal(result.gifts[0].amount, 100_000_000_000_000_000n);
  });

  it("ignores gifts addressed to someone else", () => {
    const result = findMyGifts([tip({ tipId: 0, handleHash: THEIRS })], MINE, NOW);

    assert.equal(result.gifts.length, 0);
  });

  it("compares hashes case-insensitively", () => {
    const result = findMyGifts(
      [tip({ tipId: 4, handleHash: MINE.toUpperCase().replace("0X", "0x") })],
      MINE,
      NOW
    );

    assert.equal(result.gifts.length, 1);
  });

  it("returns every one of my open gifts", () => {
    const result = findMyGifts(
      [
        tip({ tipId: 1, handleHash: THEIRS }),
        tip({ tipId: 2 }),
        tip({ tipId: 3, handleHash: THEIRS }),
        tip({ tipId: 4 }),
      ],
      MINE,
      NOW
    );

    assert.deepEqual(result.gifts.map((g) => g.tipId), [4, 2]);
  });

  it("excludes an already-claimed gift", () => {
    const result = findMyGifts(
      [
        tip({
          tipId: 5,
          claimed: true,
          claimedBy: "0x2222222222222222222222222222222222222222",
        }),
      ],
      MINE,
      NOW
    );

    assert.equal(result.gifts.length, 0);
  });

  it("excludes a refunded gift", () => {
    // refund() sets claimed, zeroes amount, leaves claimedBy at zero.
    const result = findMyGifts(
      [tip({ tipId: 6, claimed: true, claimedBy: ZERO_ADDRESS, amount: 0n })],
      MINE,
      NOW
    );

    assert.equal(result.gifts.length, 0);
  });

  it("excludes a gift past its 7-day window", () => {
    const result = findMyGifts(
      [tip({ tipId: 7, expiresAt: NOW - 1 })],
      MINE,
      NOW
    );

    assert.equal(result.gifts.length, 0, "expired gifts are refundable, not claimable");
  });

  it("orders newest first", () => {
    const result = findMyGifts(
      [tip({ tipId: 2 }), tip({ tipId: 9 }), tip({ tipId: 5 })],
      MINE,
      NOW
    );

    assert.deepEqual(result.gifts.map((g) => g.tipId), [9, 5, 2]);
  });

  it("gives each gift a claim path back to itself", () => {
    const result = findMyGifts([tip({ tipId: 6 })], MINE, NOW);

    assert.equal(result.gifts[0].claimPath, "/claim/6");
  });

  it("reports how many tips were examined", () => {
    const result = findMyGifts(
      [tip({ tipId: 1, handleHash: THEIRS }), tip({ tipId: 2 })],
      MINE,
      NOW
    );

    assert.equal(result.scanned, 2);
  });

  it("marks the result truncated only at the scan cap", () => {
    assert.equal(findMyGifts([tip({ tipId: 1 })], MINE, NOW).truncated, false);

    const many = Array.from({ length: MAX_SCAN }, (_, i) =>
      tip({ tipId: i, handleHash: THEIRS })
    );
    assert.equal(findMyGifts(many, MINE, NOW).truncated, true);
  });

  it("returns nothing for an empty chain", () => {
    const result = findMyGifts([], MINE, NOW);

    assert.deepEqual(result.gifts, []);
    assert.equal(result.scanned, 0);
  });

  it("does not treat a partial hash match as mine", () => {
    // A prefix match must not pass; these are different commitments.
    const result = findMyGifts([tip({ tipId: 1, handleHash: MINE.slice(0, 62) })], MINE, NOW);
    assert.equal(result.gifts.length, 0);
  });

  it("never leaks another handle hash in its output", () => {
    const result = findMyGifts([tip({ tipId: 1 })], MINE, NOW);
    const serialized = JSON.stringify(result.gifts, (_, v) =>
      typeof v === "bigint" ? v.toString() : v
    );

    assert.equal(serialized.includes(THEIRS), false);
  });
});

describe("expiryLabel", () => {
  it("counts days and hours", () => {
    assert.equal(expiryLabel(NOW + 4 * 86_400 + 2 * 3_600, NOW), "Expires in 4d 2h");
  });

  it("counts hours and minutes under a day", () => {
    assert.equal(expiryLabel(NOW + 2 * 3_600 + 30 * 60, NOW), "Expires in 2h 30m");
  });

  it("counts minutes under an hour", () => {
    assert.equal(expiryLabel(NOW + 12 * 60, NOW), "Expires in 12m");
  });

  it("says so when the window has passed", () => {
    assert.equal(expiryLabel(NOW - 5, NOW), "Expiring now");
  });
});