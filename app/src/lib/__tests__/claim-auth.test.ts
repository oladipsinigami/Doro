import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  buildClaimAuthMessage,
  claimAuthDigest,
  isSameAddress,
} from "../claim-auth.ts";

const CHAIN_ID = 10143;

describe("buildClaimAuthMessage", () => {
  it("includes the recipient, tip and chain", () => {
    const message = buildClaimAuthMessage({
      recipient: "0x05624DAF27FD10273409878Bce8Bcd7D75A8373e",
      tipId: 1n,
      chainId: CHAIN_ID,
    });

    assert.match(message, /05624daf27fd10273409878bce8bcd7d75a8373e/);
    assert.match(message, /Gift: 1/);
    assert.match(message, /Chain: 10143/);
  });

  it("is deterministic for identical input", () => {
    const params = {
      recipient: "0x05624DAF27FD10273409878Bce8Bcd7D75A8373e" as const,
      tipId: 7n,
      chainId: CHAIN_ID,
    };
    assert.equal(
      buildClaimAuthMessage(params),
      buildClaimAuthMessage(params)
    );
  });

  it("differs when the tip changes, blocking cross-tip replay", () => {
    const recipient = "0x05624DAF27FD10273409878Bce8Bcd7D75A8373e" as const;
    const a = buildClaimAuthMessage({ recipient, tipId: 1n, chainId: CHAIN_ID });
    const b = buildClaimAuthMessage({ recipient, tipId: 2n, chainId: CHAIN_ID });
    assert.notEqual(a, b);
  });

  it("differs when the chain changes, blocking cross-chain replay", () => {
    const recipient = "0x05624DAF27FD10273409878Bce8Bcd7D75A8373e" as const;
    const testnet = buildClaimAuthMessage({ recipient, tipId: 1n, chainId: 10143 });
    const mainnet = buildClaimAuthMessage({ recipient, tipId: 1n, chainId: 143 });
    assert.notEqual(testnet, mainnet);
  });

  it("normalizes address casing so signature checks are stable", () => {
    const lower = buildClaimAuthMessage({
      recipient: "0x05624daf27fd10273409878bce8bcd7d75a8373e",
      tipId: 1n,
      chainId: CHAIN_ID,
    });
    const mixed = buildClaimAuthMessage({
      recipient: "0x05624DAF27FD10273409878Bce8Bcd7D75A8373e",
      tipId: 1n,
      chainId: CHAIN_ID,
    });
    assert.equal(lower, mixed);
  });

  it("states that no funds move", () => {
    const message = buildClaimAuthMessage({
      recipient: "0x05624DAF27FD10273409878Bce8Bcd7D75A8373e",
      tipId: 1n,
      chainId: CHAIN_ID,
    });
    assert.match(message, /does not move any funds/i);
  });
});

describe("ownership proof round-trip (real signatures)", () => {
  it("recovers the signer that produced the proof", async () => {
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );
    const message = buildClaimAuthMessage({
      recipient: account.address,
      tipId: 1n,
      chainId: CHAIN_ID,
    });

    const signature = await account.signMessage({ message });

    const recovered = await recoverMessageAddress({
      message,
      signature,
    });

    assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
  });

  it("rejects a proof signed by a different key", async () => {
    const owner = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );
    const attacker = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
    );

    const message = buildClaimAuthMessage({
      recipient: owner.address,
      tipId: 1n,
      chainId: CHAIN_ID,
    });
    const signature = await attacker.signMessage({ message });
    const recovered = await recoverMessageAddress({ message, signature });

    // The whole point: attacker cannot produce a proof for owner's address.
    assert.notEqual(recovered.toLowerCase(), owner.address.toLowerCase());
  });

  it("a proof for tip 1 does not verify for tip 2", async () => {
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    );
    const tip1 = buildClaimAuthMessage({
      recipient: account.address,
      tipId: 1n,
      chainId: CHAIN_ID,
    });
    const tip2 = buildClaimAuthMessage({
      recipient: account.address,
      tipId: 2n,
      chainId: CHAIN_ID,
    });
    const signature = await account.signMessage({ message: tip1 });
    const recovered = await recoverMessageAddress({ message: tip2, signature });
    assert.notEqual(recovered.toLowerCase(), account.address.toLowerCase());
  });
});

describe("isSameAddress", () => {
  it("compares case-insensitively", () => {
    assert.equal(
      isSameAddress("0xABCD", "0xabcd"),
      true
    );
  });

  it("returns false for different addresses", () => {
    assert.equal(isSameAddress("0xabcd", "0xabce"), false);
  });

  it("returns false when either side is missing", () => {
    assert.equal(isSameAddress(null, "0xabcd"), false);
    assert.equal(isSameAddress("0xabcd", undefined), false);
    assert.equal(isSameAddress(null, null), false);
  });
});

describe("claimAuthDigest", () => {
  it("returns a 32-byte hash", () => {
    assert.match(
      claimAuthDigest("hello"),
      /^0x[0-9a-f]{64}$/
    );
  });
});
