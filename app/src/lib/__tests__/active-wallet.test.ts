import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isEmbeddedWallet, pickActiveWallet } from "../active-wallet.ts";

const RABBY = {
  address: "0x1111111111111111111111111111111111111111",
  walletClientType: "rabby_wallet",
  connectorType: "injected",
  connectedAt: 1_000,
};

const OLD_METAMASK = {
  address: "0x2222222222222222222222222222222222222222",
  walletClientType: "metamask",
  connectorType: "injected",
  connectedAt: 500,
};

const PRIVY_EMBEDDED = {
  address: "0x3333333333333333333333333333333333333333",
  walletClientType: "privy",
  connectorType: "privy",
  connectedAt: 9_999,
};

describe("isEmbeddedWallet", () => {
  it("flags a Privy-provisioned wallet", () => {
    assert.equal(isEmbeddedWallet(PRIVY_EMBEDDED), true);
  });

  it("does not flag a real wallet", () => {
    assert.equal(isEmbeddedWallet(RABBY), false);
  });
});

describe("pickActiveWallet", () => {
  it("returns null when nothing is connected", () => {
    assert.equal(pickActiveWallet([]), null);
  });

  it("returns the only wallet when there is exactly one", () => {
    assert.equal(pickActiveWallet([RABBY]), RABBY);
  });

  it("never picks an embedded wallet, even as the newest", () => {
    // The bug this guards: embedded sorts last by connectedAt, so picking the
    // most recent entry would hand back the Privy key rather than the wallet
    // the recipient actually connected.
    const picked = pickActiveWallet([PRIVY_EMBEDDED, RABBY]);
    assert.equal(picked, RABBY);
  });

  it("ignores an embedded wallet that is the only entry", () => {
    assert.equal(pickActiveWallet([PRIVY_EMBEDDED]), null);
  });

  it("picks the most recently connected real wallet", () => {
    const picked = pickActiveWallet([OLD_METAMASK, RABBY]);
    assert.equal(picked, RABBY);
    assert.equal(picked?.address, "0x1111111111111111111111111111111111111111");
  });

  it("does not depend on array order", () => {
    const a = pickActiveWallet([OLD_METAMASK, RABBY]);
    const b = pickActiveWallet([RABBY, OLD_METAMASK]);
    assert.equal(a?.address, b?.address);
  });

  it("skips the embedded wallet wherever it sits", () => {
    assert.equal(pickActiveWallet([RABBY, PRIVY_EMBEDDED])?.address, RABBY.address);
    assert.equal(pickActiveWallet([PRIVY_EMBEDDED, OLD_METAMASK])?.address, OLD_METAMASK.address);
  });

  it("prefers a stamped wallet over one with no connectedAt", () => {
    // Unknown recency sorts as oldest rather than newest. Guessing "just
    // connected" for an unstamped wallet is how the wrong one gets picked.
    const noStamp = {
      address: "0x4444444444444444444444444444444444444444",
      walletClientType: "phantom",
    };
    const picked = pickActiveWallet([RABBY, noStamp]);
    assert.equal(picked?.address, RABBY.address);
  });

  it("still returns an unstamped wallet when it is the only candidate", () => {
    const noStamp = {
      address: "0x4444444444444444444444444444444444444444",
      walletClientType: "phantom",
    };
    assert.equal(pickActiveWallet([noStamp]), noStamp);
  });
});