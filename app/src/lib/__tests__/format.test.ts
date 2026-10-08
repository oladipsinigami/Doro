import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMon, shortAddress } from "../format.ts";

describe("formatMon", () => {
  it("converts wei to MON", () => {
    // 0.02 MON
    assert.equal(formatMon("20000000000000000"), "0.02 MON");
  });

  it("trims trailing zeros", () => {
    assert.equal(formatMon("1000000000000000000"), "1 MON");
  });

  it("keeps a decimal that is not noise", () => {
    assert.equal(formatMon("1234500000000000000"), "1.2345 MON");
  });

  it("handles sub-wei dust without collapsing to zero", () => {
    assert.equal(formatMon("1"), "0.000000000000000001 MON");
  });

  it("accepts a bigint as well as a JSON string", () => {
    assert.equal(formatMon(20000000000000000n), "0.02 MON");
  });

  it("returns a placeholder rather than throwing on junk", () => {
    assert.equal(formatMon("not-a-number"), "unknown");
  });
});

describe("shortAddress", () => {
  const addr = "0x1234567890abcdef1234567890abcdef12345678";

  it("keeps the head and tail", () => {
    assert.equal(shortAddress(addr), "0x1234…5678");
  });

  it("does not mangle uppercase addresses", () => {
    assert.equal(
      shortAddress("0xABCDEF7890ABCDEF1234567890ABCDEF12345678"),
      "0xABCD…5678"
    );
  });

  it("rejects anything that is not an address", () => {
    assert.equal(shortAddress("0x123"), "unknown");
    assert.equal(shortAddress(""), "unknown");
    assert.equal(shortAddress("vitalik.eth"), "unknown");
  });
});