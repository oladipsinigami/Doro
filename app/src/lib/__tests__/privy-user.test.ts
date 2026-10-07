import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findEmbeddedWalletAddress,
  findTwitterUsername,
} from "../privy-user.ts";

const WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("findEmbeddedWalletAddress", () => {
  it("reads the wallet from user.wallets (Privy v3 shape)", () => {
    // This is the regression: the wallet is NOT in linkedAccounts.
    const user = {
      wallets: [{ address: WALLET, walletClientType: "privy" }],
      linkedAccounts: [{ type: "twitter_oauth", username: "alice" }],
    };

    assert.equal(findEmbeddedWalletAddress(user), WALLET);
  });

  it("falls back to linkedAccounts when wallets is absent", () => {
    const user = {
      linkedAccounts: [
        { type: "twitter_oauth", username: "alice" },
        { address: WALLET, walletClientType: "privy" },
      ],
    };

    assert.equal(findEmbeddedWalletAddress(user), WALLET);
  });

  it("reads snake_case wallets from REST responses", () => {
    const user = {
      wallets: [{ address: WALLET, wallet_client_type: "privy" }],
    };

    assert.equal(findEmbeddedWalletAddress(user), WALLET);
  });

  it("ignores external wallets", () => {
    const user = {
      wallets: [
        { address: "0x1111111111111111111111111111111111111111", walletClientType: "metamask" },
      ],
    };

    assert.equal(findEmbeddedWalletAddress(user), null);
  });

  it("returns null when there is no wallet at all", () => {
    assert.equal(findEmbeddedWalletAddress({ wallets: [], linkedAccounts: [] }), null);
    assert.equal(findEmbeddedWalletAddress({}), null);
    assert.equal(findEmbeddedWalletAddress(null), null);
    assert.equal(findEmbeddedWalletAddress(undefined), null);
  });

  it("rejects a malformed address rather than returning it", () => {
    // A wrong address would make every claim revert with InvalidRecipient.
    for (const bad of ["0x123", "not-an-address", "", 12345, null]) {
      const user = { wallets: [{ address: bad, walletClientType: "privy" }] };
      assert.equal(findEmbeddedWalletAddress(user as any), null);
    }
  });

  it("ignores entries without a walletClientType", () => {
    const user = { wallets: [{ address: WALLET }] };
    assert.equal(findEmbeddedWalletAddress(user), null);
  });

  it("does not throw on malformed input", () => {
    assert.equal(findEmbeddedWalletAddress({ wallets: "nope" } as any), null);
    assert.equal(findEmbeddedWalletAddress({ wallets: [null, undefined, 7] } as any), null);
  });
});

describe("findTwitterUsername", () => {
  it("reads the handle from twitter_oauth linked accounts", () => {
    const user = { linkedAccounts: [{ type: "twitter_oauth", username: "alice" }] };
    assert.equal(findTwitterUsername(user), "alice");
  });

  it("reads the handle from twitter linked accounts", () => {
    const user = { linkedAccounts: [{ type: "twitter", username: "bob" }] };
    assert.equal(findTwitterUsername(user), "bob");
  });

  it("reads snake_case linked_accounts", () => {
    const user = { linked_accounts: [{ type: "twitter_oauth", username: "carol" }] };
    assert.equal(findTwitterUsername(user), "carol");
  });

  it("falls back to the top-level twitter object", () => {
    assert.equal(findTwitterUsername({ twitter: { username: "dave" } }), "dave");
  });

  it("prefers the linked account over the top-level object", () => {
    const user = {
      linkedAccounts: [{ type: "twitter_oauth", username: "linked" }],
      twitter: { username: "top-level" },
    };
    assert.equal(findTwitterUsername(user), "linked");
  });

  it("returns null when no X account is linked", () => {
    assert.equal(findTwitterUsername({ linkedAccounts: [{ type: "google_oauth" }] }), null);
    assert.equal(findTwitterUsername({}), null);
    assert.equal(findTwitterUsername(null), null);
  });

  it("ignores empty usernames", () => {
    assert.equal(findTwitterUsername({ linkedAccounts: [{ type: "twitter", username: "" }] }), null);
    assert.equal(findTwitterUsername({ twitter: { username: "" } }), null);
  });
});
