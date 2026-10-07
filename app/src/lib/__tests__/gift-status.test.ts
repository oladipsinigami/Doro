import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyGift,
  fallbackTipIds,
  refundAmountsForSender,
  refundWindowLabel,
  tipIdsForSender,
} from "../gift-status.ts";

const NOW = 1_700_000_000;

describe("classifyGift", () => {
  it("marks an open gift as pending", () => {
    assert.equal(
      classifyGift(
        {
          createdAt: NOW - 100,
          expiresAt: NOW + 1000,
          claimed: false,
          claimedBy: "0x0000000000000000000000000000000000000000",
          amount: 1000n,
        },
        NOW
      ),
      "pending"
    );
  });

  it("marks an unclaimed gift past the window as refundable", () => {
    assert.equal(
      classifyGift(
        {
          createdAt: NOW - 10_000,
          expiresAt: NOW - 10,
          claimed: false,
          claimedBy: "0x0000000000000000000000000000000000000000",
          amount: 1000n,
        },
        NOW
      ),
      "refundable"
    );
  });

  it("marks a gift claimed by a real address as claimed", () => {
    assert.equal(
      classifyGift(
        {
          createdAt: NOW - 100,
          expiresAt: NOW + 1000,
          claimed: true,
          claimedBy: "0xabcDEF0000000000000000000000000000000001",
          amount: 1000n,
        },
        NOW
      ),
      "claimed"
    );
  });

  it("marks a refund as refunded when claimedBy is still the zero address and the amount is zero", () => {
    assert.equal(
      classifyGift(
        {
          createdAt: NOW - 10_000,
          expiresAt: NOW - 10,
          claimed: true,
          claimedBy: "0x0000000000000000000000000000000000000000",
          amount: 0n,
        },
        NOW
      ),
      "refunded"
    );
  });

  it("marks a missing gift when createdAt is zero", () => {
    assert.equal(
      classifyGift(
        {
          createdAt: 0,
          expiresAt: 0,
          claimed: false,
          claimedBy: "0x0000000000000000000000000000000000000000",
          amount: 0n,
        },
        NOW
      ),
      "missing"
    );
  });
});

describe("tipIdsForSender", () => {
  it("returns every gift that sender created, newest first, with no window cap", () => {
    const sender = "0xabcDEF0000000000000000000000000000000001";
    const ids = tipIdsForSender(
      [
        { args: { tipId: 1n, sender } },
        { args: { tipId: 40n, sender: "0x0000000000000000000000000000000000000002" } },
        { args: { tipId: 80n, sender } },
        { args: { tipId: 4n, sender } },
      ],
      sender
    );
    assert.deepEqual(ids, [80, 4, 1]);
  });
});

describe("refundAmountsForSender", () => {
  it("keeps the amount a refund returned, which getTip no longer stores", () => {
    const sender = "0xabcDEF0000000000000000000000000000000001";
    const amounts = refundAmountsForSender(
      [
        { args: { tipId: 4n, sender, amount: 50000000000000000n } },
        { args: { tipId: 9n, sender: "0x0000000000000000000000000000000000000002", amount: 1n } },
      ],
      sender
    );
    assert.equal(amounts.get(4), 50000000000000000n);
    assert.equal(amounts.has(9), false);
  });
});

describe("fallbackTipIds", () => {
  it("scans every id when the history is shorter than the cap", () => {
    assert.deepEqual(fallbackTipIds(3), { ids: [2, 1, 0], truncated: false });
  });

  it("caps a failed log query and says the list is incomplete", () => {
    const result = fallbackTipIds(250, 200);
    assert.equal(result.ids.length, 200);
    assert.equal(result.ids[0], 249);
    assert.equal(result.ids[199], 50);
    assert.equal(result.truncated, true);
  });
});

describe("refundWindowLabel", () => {
  it("counts down until the sender can take the gift back", () => {
    const now = 1_700_000_000;
    assert.equal(refundWindowLabel(now + 4 * 86_400 + 2 * 3_600, now), "Refundable in 4d 2h");
    assert.equal(refundWindowLabel(now - 1, now), "Refundable now");
  });
});
