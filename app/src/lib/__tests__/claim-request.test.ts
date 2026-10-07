import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractClaimRequest,
  extractWalletClaimRequest,
} from "../claim-request.ts";

describe("extractClaimRequest", () => {
  it("accepts a well-formed body", () => {
    const result = extractClaimRequest({
      tipId: 7,
      accessToken: "jwt-a",
      identityToken: "jwt-b",
    });

    assert.equal(result.ok, true);
    assert.equal(result.value.tipId, 7n);
    assert.equal(result.value.accessToken, "jwt-a");
    assert.equal(result.value.identityToken, "jwt-b");
  });

  it("accepts a tipId sent as a numeric string", () => {
    const result = extractClaimRequest({ tipId: "7", accessToken: "jwt-a" });

    assert.equal(result.ok, true);
    assert.equal(result.value.tipId, 7n);
  });

  it("treats a missing identityToken as acceptable", () => {
    const result = extractClaimRequest({ tipId: 1, accessToken: "jwt-a" });

    assert.equal(result.ok, true);
    assert.equal(result.value.identityToken, undefined);
  });

  it("requires tipId", () => {
    const result = extractClaimRequest({ accessToken: "jwt-a" });

    assert.equal(result.ok, false);
    assert.equal(result.error, "BAD_REQUEST");
  });

  it("requires accessToken", () => {
    const result = extractClaimRequest({ tipId: 1 });

    assert.equal(result.ok, false);
    assert.equal(result.error, "BAD_REQUEST");
  });

  it("rejects a non-integer tipId", () => {
    const result = extractClaimRequest({ tipId: 1.5, accessToken: "jwt-a" });

    assert.equal(result.ok, false);
    assert.equal(result.error, "BAD_REQUEST");
  });

  it("rejects a negative tipId", () => {
    const result = extractClaimRequest({ tipId: -1, accessToken: "jwt-a" });

    assert.equal(result.ok, false);
    assert.equal(result.error, "BAD_REQUEST");
  });

  it("rejects a tipId beyond uint256", () => {
    const result = extractClaimRequest({
      tipId: "115792089237316195423570985008687907853269984665640564039457584007913129639936",
      accessToken: "jwt-a",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "BAD_REQUEST");
  });

  it("ignores a client-supplied handle", () => {
    const result = extractClaimRequest({
      tipId: 7,
      accessToken: "jwt-a",
      handle: "victim",
    });

    assert.equal(result.ok, true);
    assert.equal(
      Object.keys(result.value).includes("handle"),
      false,
      "handle must not survive extraction"
    );
  });

  it("ignores a client-supplied recipient", () => {
    const result = extractClaimRequest({
      tipId: 7,
      accessToken: "jwt-a",
      recipient: "0x0000000000000000000000000000000000000001",
    });

    assert.equal(result.ok, true);
    assert.equal(
      Object.keys(result.value).includes("recipient"),
      false,
      "recipient must not survive extraction"
    );
  });

  it("ignores client-supplied deadline and signature", () => {
    const result = extractClaimRequest({
      tipId: 7,
      accessToken: "jwt-a",
      deadline: 9999999999,
      signature: "0xdeadbeef",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.value).sort(), [
      "accessToken",
      "tipId",
    ]);
  });

  it("returns only allowlisted fields for a body full of attacker input", () => {
    const result = extractClaimRequest({
      tipId: 7,
      accessToken: "jwt-a",
      identityToken: "jwt-b",
      handle: "victim",
      recipient: "0x0000000000000000000000000000000000000001",
      handleHash: "0x00",
      deadline: 9999999999,
      signature: "0xdeadbeef",
      claimSigner: "0x0000000000000000000000000000000000000002",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.value).sort(), [
      "accessToken",
      "identityToken",
      "tipId",
    ]);
  });

  it("rejects a non-object body", () => {
    for (const body of [null, undefined, "string", 42, []]) {
      const result = extractClaimRequest(body);
      assert.equal(result.ok, false, `body ${JSON.stringify(body)} must fail`);
      assert.equal(result.error, "BAD_REQUEST");
    }
  });

  it("rejects a non-string accessToken", () => {
    const result = extractClaimRequest({ tipId: 1, accessToken: { a: 1 } });

    assert.equal(result.ok, false);
    assert.equal(result.error, "BAD_REQUEST");
  });

  it("rejects an empty-string accessToken", () => {
    const result = extractClaimRequest({ tipId: 1, accessToken: "   " });

    assert.equal(result.ok, false);
    assert.equal(result.error, "BAD_REQUEST");
  });
});

const SIG = `0x${"ab".repeat(65)}`;
const ADDR = "0x05624DAF27FD10273409878Bce8Bcd7D75A8373e";

describe("extractWalletClaimRequest", () => {
  it("accepts a well-formed wallet claim", () => {
    const result = extractWalletClaimRequest({
      tipId: 1,
      accessToken: "jwt",
      recipient: ADDR,
      recipientSignature: SIG,
    });

    assert.equal(result.ok, true);
    assert.equal(result.value.recipient, ADDR);
    assert.equal(result.value.recipientSignature, SIG);
  });

  it("requires a recipient address", () => {
    const result = extractWalletClaimRequest({
      tipId: 1,
      accessToken: "jwt",
      recipientSignature: SIG,
    });
    assert.equal(result.ok, false);
  });

  it("requires an ownership signature", () => {
    const result = extractWalletClaimRequest({
      tipId: 1,
      accessToken: "jwt",
      recipient: ADDR,
    });
    assert.equal(result.ok, false);
  });

  it("rejects a malformed recipient address", () => {
    for (const bad of ["0x123", "nothex", "", 123, {}, ADDR.slice(0, -1)]) {
      const result = extractWalletClaimRequest({
        tipId: 1,
        accessToken: "jwt",
        recipient: bad,
        recipientSignature: SIG,
      });
      assert.equal(result.ok, false, `recipient ${bad} must fail`);
    }
  });

  it("rejects a malformed signature", () => {
    for (const bad of ["0xdeadbeef", "0xzz", "", null, 99]) {
      const result = extractWalletClaimRequest({
        tipId: 1,
        accessToken: "jwt",
        recipient: ADDR,
        recipientSignature: bad,
      });
      assert.equal(result.ok, false, `signature ${bad} must fail`);
    }
  });

  it("still ignores a client-supplied handle", () => {
    const result = extractWalletClaimRequest({
      tipId: 1,
      accessToken: "jwt",
      recipient: ADDR,
      recipientSignature: SIG,
      handle: "attacker",
    });

    assert.equal(result.ok, true);
    assert.equal(Object.keys(result.value).includes("handle"), false);
  });

  it("still requires a valid tipId", () => {
    const result = extractWalletClaimRequest({
      tipId: -1,
      accessToken: "jwt",
      recipient: ADDR,
      recipientSignature: SIG,
    });
    assert.equal(result.ok, false);
  });
});