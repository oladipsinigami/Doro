import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildClaimPath,
  normalizeSenderHandle,
  readClaimCard,
} from "../gift-link.ts";
import { MASCOTS } from "../mascots.ts";

describe("buildClaimPath", () => {
  it("refuses a link when the gift id was not read from the receipt", () => {
    const result = buildClaimPath({
      tipId: undefined,
      mascotId: "barista-bear",
      note: "coffee",
    });
    assert.equal(result.ok, false);
  });

  it("puts the courier and the note on the claim link", () => {
    const result = buildClaimPath({
      tipId: 12,
      mascotId: "barista-bear",
      note: "  Thanks for the alpha  ",
      origin: "https://doro.example",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    const url = new URL(result.url);
    assert.equal(url.origin + url.pathname, "https://doro.example/claim/12");
    assert.equal(url.searchParams.get("m"), "barista-bear");
    assert.equal(url.searchParams.get("n"), "Thanks for the alpha");
  });

  it("drops an unknown courier and a blank note instead of inventing them", () => {
    const result = buildClaimPath({
      tipId: 3,
      mascotId: "not-a-courier",
      note: "   ",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.url, "/claim/3");
  });

  it("caps the note at 140 characters", () => {
    const result = buildClaimPath({
      tipId: 1,
      mascotId: "doro-angel",
      note: "a".repeat(200),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const note = new URL(`https://doro.example${result.url}`).searchParams.get("n");
    assert.equal(note?.length, 140);
  });
});

describe("known couriers", () => {
  it("accepts every courier defined in MASCOTS", () => {
    for (const mascot of MASCOTS) {
      const result = buildClaimPath({ tipId: 1, mascotId: mascot.id, note: "" });
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      assert.equal(new URL(`https://doro.example${result.url}`).searchParams.get("m"), mascot.id);
    }
  });
});

describe("normalizeSenderHandle", () => {
  it("strips @ and lowercases", () => {
    assert.equal(normalizeSenderHandle("@Vitalik"), "vitalik");
  });

  it("returns null for empty or malformed input", () => {
    assert.equal(normalizeSenderHandle(""), null);
    assert.equal(normalizeSenderHandle("@"), null);
    assert.equal(normalizeSenderHandle("has space"), null);
    assert.equal(normalizeSenderHandle("a".repeat(16)), null);
  });
});

describe("sender handle on the claim link", () => {
  it("carries a valid handle", () => {
    const r = buildClaimPath({ tipId: 4, mascotId: "doro-angel", note: "", senderHandle: "@Oladips" });
    assert.match(r.url, /f=oladips/);
  });

  it("omits the param when the sender skips it", () => {
    const r = buildClaimPath({ tipId: 4, mascotId: "doro-angel", note: "" });
    assert.equal(r.url.includes("f="), false);
  });

  it("omits a malformed handle rather than writing it into the URL", () => {
    const r = buildClaimPath({ tipId: 4, mascotId: "doro-angel", note: "", senderHandle: "bad handle!" });
    assert.equal(r.url.includes("f="), false);
  });

  it("round-trips through readClaimCard", () => {
    const r = buildClaimPath({ tipId: 4, mascotId: "doro-angel", note: "", senderHandle: "oladips" });
    const q = new URL(r.url, "http://x").searchParams;
    assert.equal(readClaimCard(q).senderHandle, "oladips");
  });

  it("readClaimCard drops a malformed f param", () => {
    const q = new URL("/claim/4?f=%3Cscript%3E", "http://x").searchParams;
    assert.equal(readClaimCard(q).senderHandle, null);
  });
});

describe("sender avatar on the claim link", () => {
  const AVATAR = "https://pbs.twimg.com/profile_images/1/a_normal.jpg";

  it("carries the avatar when a handle is present", () => {
    const r = buildClaimPath({
      tipId: 4,
      mascotId: "doro-angel",
      note: "",
      senderHandle: "oladips",
      senderAvatarUrl: AVATAR,
    });
    assert.match(r.url, /fa=/);
  });

  it("omits the avatar without a handle, so an avatar cannot stand alone", () => {
    const r = buildClaimPath({
      tipId: 4,
      mascotId: "doro-angel",
      note: "",
      senderAvatarUrl: AVATAR,
    });
    assert.equal(r.url.includes("fa="), false);
  });

  it("rejects a non-https avatar rather than writing it into the URL", () => {
    for (const bad of ["javascript:alert(1)", "data:image/svg+xml,<svg>", "http://x.test/a.jpg"]) {
      const r = buildClaimPath({
        tipId: 4,
        mascotId: "doro-angel",
        note: "",
        senderHandle: "oladips",
        senderAvatarUrl: bad,
      });
      assert.equal(r.url.includes("fa="), false, `${bad} must be rejected`);
    }
  });

  it("round-trips through readClaimCard", () => {
    const r = buildClaimPath({
      tipId: 4,
      mascotId: "doro-angel",
      note: "",
      senderHandle: "oladips",
      senderAvatarUrl: AVATAR,
    });
    const q = new URL(r.url, "http://x").searchParams;
    assert.equal(readClaimCard(q).senderAvatarUrl, AVATAR);
  });

  it("readClaimCard drops an injected non-https avatar", () => {
    const q = new URL("/claim/4?f=oladips&fa=javascript%3Aalert(1)", "http://x").searchParams;
    assert.equal(readClaimCard(q).senderAvatarUrl, null);
  });
});

describe("readClaimCard", () => {
  it("reads the courier and note the sender attached", () => {
    const params = new URLSearchParams("m=star-bunny&n=For%20your%20birthday");
    assert.deepEqual(readClaimCard(params), {
      mascotId: "star-bunny",
      note: "For your birthday",
      senderHandle: null,
      senderAvatarUrl: null,
    });
  });

  it("falls back to Doro Angel when the courier id is missing or unknown", () => {
    assert.equal(readClaimCard(new URLSearchParams()).mascotId, "doro-angel");
    assert.equal(
      readClaimCard(new URLSearchParams("m=nope")).mascotId,
      "doro-angel"
    );
  });
});
