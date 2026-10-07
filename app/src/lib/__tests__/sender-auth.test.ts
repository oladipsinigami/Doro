import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  buildSenderAuthMessage,
  isSameAddress,
} from "../claim-auth.ts";

const CHAIN_ID = 10143;

describe("buildSenderAuthMessage", () => {
  it("includes the sender address and chain", () => {
    const message = buildSenderAuthMessage({
      sender: "0xdB99D8C6b401cF97eaE6c835345938edF5299d25",
      chainId: CHAIN_ID,
    });

    assert.match(message, /db99d8c6b401cf97eae6c835345938edf5299d25/);
    assert.match(message, /Chain: 10143/);
  });

  it("is deterministic", () => {
    const params = {
      sender: "0xdB99D8C6b401cF97eaE6c835345938edF5299d25" as const,
      chainId: CHAIN_ID,
    };
    assert.equal(buildSenderAuthMessage(params), buildSenderAuthMessage(params));
  });

  it("normalizes address casing", () => {
    const lower = buildSenderAuthMessage({
      sender: "0xdb99d8c6b401cf97eae6c835345938edf5299d25",
      chainId: CHAIN_ID,
    });
    const mixed = buildSenderAuthMessage({
      sender: "0xdB99D8C6b401cF97eaE6c835345938edF5299d25",
      chainId: CHAIN_ID,
    });
    assert.equal(lower, mixed);
  });

  it("differs by chain, so a signature cannot be lifted to another chain", () => {
    const sender = "0xdB99D8C6b401cF97eaE6c835345938edF5299d25" as const;
    assert.notEqual(
      buildSenderAuthMessage({ sender, chainId: 10143 }),
      buildSenderAuthMessage({ sender, chainId: 143 })
    );
  });

  it("states that no funds move", () => {
    const message = buildSenderAuthMessage({
      sender: "0xdB99D8C6b401cF97eaE6c835345938edF5299d25",
      chainId: CHAIN_ID,
    });
    assert.match(message, /does not move any funds/i);
  });

  it("does not claim to be an ownership or claim proof", () => {
    const message = buildSenderAuthMessage({
      sender: "0xdB99D8C6b401cF97eaE6c835345938edF5299d25",
      chainId: CHAIN_ID,
    });
    assert.equal(/may claim/i.test(message), false);
  });
});

describe("sender identity proof round-trip", () => {
  it("recovers the sender that signed it", async () => {
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );
    const message = buildSenderAuthMessage({
      sender: account.address,
      chainId: CHAIN_ID,
    });

    const signature = await account.signMessage({ message });
    const recovered = await recoverMessageAddress({ message, signature });

    assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
  });

  it("cannot be produced by a different key for someone else's address", async () => {
    const victim = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );
    const attacker = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    );

    const message = buildSenderAuthMessage({
      sender: victim.address,
      chainId: CHAIN_ID,
    });
    const signature = await attacker.signMessage({ message });
    const recovered = await recoverMessageAddress({ message, signature });

    assert.notEqual(recovered.toLowerCase(), victim.address.toLowerCase());
  });
});

describe("isSameAddress", () => {
  it("compares case-insensitively", () => {
    assert.equal(isSameAddress("0xABCD", "0xabcd"), true);
  });

  it("returns false for different addresses or missing values", () => {
    assert.equal(isSameAddress("0xabcd", "0xabce"), false);
    assert.equal(isSameAddress(null, "0xabcd"), false);
    assert.equal(isSameAddress(null, null), false);
  });
});