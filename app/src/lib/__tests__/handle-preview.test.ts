import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPreview,
  fetchRecipientProfile,
  normalizePreviewHandle,
  parseProfileBody,
} from "../handle-preview.ts";

describe("normalizePreviewHandle", () => {
  it("strips a leading @ and lowercases", () => {
    assert.equal(normalizePreviewHandle("@VitalikButerin"), "vitalikbuterin");
  });

  it("strips multiple leading @ signs", () => {
    assert.equal(normalizePreviewHandle("@@alice"), "alice");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(normalizePreviewHandle("  @alice  "), "alice");
  });

  it("accepts underscores and digits", () => {
    assert.equal(normalizePreviewHandle("metro_tester"), "metro_tester");
    assert.equal(normalizePreviewHandle("user_123"), "user_123");
  });

  it("rejects an empty handle", () => {
    assert.equal(normalizePreviewHandle(""), null);
    assert.equal(normalizePreviewHandle("@"), null);
    assert.equal(normalizePreviewHandle("   "), null);
  });

  it("rejects handles over 15 characters", () => {
    assert.equal(normalizePreviewHandle("a".repeat(16)), null);
    assert.equal(normalizePreviewHandle("a".repeat(15)), "a".repeat(15));
  });

  it("rejects characters X does not permit", () => {
    assert.equal(normalizePreviewHandle("alice.bob"), null);
    assert.equal(normalizePreviewHandle("alice-bob"), null);
    assert.equal(normalizePreviewHandle("alice bob"), null);
  });

  it("rejects the 18-character handle used in the README runbook", () => {
    assert.equal(normalizePreviewHandle("metropolis_tester"), null);
  });
});

/**
 * Existence must be decided from the body, not the status code: the browser
 * reports status 0 for cross-origin responses, and the upstream has been seen
 * returning 404 with a valid body.
 */
describe("parseProfileBody", () => {
  it("extracts a profile from a 200 JSON body", () => {
    const profile = parseProfileBody(
      JSON.stringify({
        code: 200,
        user: {
          screen_name: "alice",
          name: "Alice",
          avatar_url: "https://pbs.twimg.com/a.jpg",
        },
      })
    );

    assert.equal(profile?.handle, "alice");
    assert.equal(profile?.displayName, "Alice");
    assert.equal(profile?.avatarUrl, "https://pbs.twimg.com/a.jpg");
  });

  it("extracts a profile even when the status was 404", () => {
    // Observed in the wild: a real account returned 404 with valid JSON.
    const profile = parseProfileBody(
      JSON.stringify({ user: { screen_name: "jack", name: "jack" } })
    );

    assert.equal(profile?.handle, "jack");
  });

  it("returns null for JSON without a user", () => {
    assert.equal(parseProfileBody(JSON.stringify({ code: 404 })), null);
    assert.equal(parseProfileBody(JSON.stringify({ user: {} })), null);
    assert.equal(parseProfileBody(JSON.stringify({ user: { screen_name: "" } })), null);
  });

  it("returns null for the HTML fallback page", () => {
    assert.equal(parseProfileBody("<!DOCTYPE html><html>not found</html>"), null);
  });

  it("returns null for garbage", () => {
    assert.equal(parseProfileBody(""), null);
    assert.equal(parseProfileBody("{not json"), null);
  });

  it("rejects a non-https avatar URL", () => {
    const profile = parseProfileBody(
      JSON.stringify({
        user: { screen_name: "alice", avatar_url: "javascript:alert(1)" },
      })
    );

    assert.equal(profile?.avatarUrl, null);
  });
});

describe("buildPreview", () => {
  it("is idle for an invalid handle", () => {
    const preview = buildPreview("not a handle", "found");

    assert.equal(preview.state, "idle");
    assert.equal(preview.avatarUrl, null);
  });

  it("reports loading while unresolved", () => {
    const preview = buildPreview("@alice", "loading");

    assert.equal(preview.state, "loading");
    assert.equal(preview.handle, "alice");
  });

  it("returns the profile once found", () => {
    const preview = buildPreview("@alice", "found", {
      handle: "alice",
      displayName: "Alice",
      avatarUrl: "https://pbs.twimg.com/a.jpg",
    });

    assert.equal(preview.displayName, "Alice");
    assert.equal(preview.avatarUrl, "https://pbs.twimg.com/a.jpg");
  });

  it("prefers X's canonical spelling over the typed one", () => {
    const preview = buildPreview("@vitalikbuterin", "found", {
      handle: "VitalikButerin",
      displayName: "vitalik.eth",
      avatarUrl: null,
    });

    assert.equal(preview.handle, "VitalikButerin");
  });

  it("distinguishes an error from a missing account", () => {
    // A network failure must not be reported as "no such account".
    assert.equal(buildPreview("@alice", "error").state, "error");
    assert.notEqual(buildPreview("@alice", "error").state, "missing");
  });
});

/**
 * Live contract test against the real upstream.
 *
 * `api.fxtwitter.com` is a free community service with no SLA: it rate-limits,
 * returns HTML fallback pages, and intermittently serves non-JSON. A null result
 * for a known-good handle therefore means "upstream degraded", not "regression" —
 * asserting on it would make the suite flaky for a reason unrelated to this code.
 *
 * The deterministic behaviour (JSON shape, HTML rejection, malformed input) is
 * covered by the parseProfileBody tests above. These two only verify the live
 * contract when the service is cooperating.
 */
describe("fetchRecipientProfile (live)", () => {
  it("finds a real account", async (t) => {
    let profile: Awaited<ReturnType<typeof fetchRecipientProfile>> | null = null;
    try {
      profile = await fetchRecipientProfile("oladipsingami");
    } catch (err) {
      if ((err as Error).name === "TypeError") {
        t.skip("network unavailable");
        return;
      }
      throw err;
    }

    if (profile === null) {
      t.skip("upstream returned no profile (rate limit or degraded service)");
      return;
    }

    assert.equal(profile.handle, "oladipsingami");
    assert.match(profile.avatarUrl ?? "", /^https:\/\//);
  });

  it("returns null for an account that does not exist", async (t) => {
    try {
      assert.equal(await fetchRecipientProfile("zzq99thisdoesnotexist1234xyz"), null);
    } catch (err) {
      if ((err as Error).name === "TypeError") {
        t.skip("network unavailable");
        return;
      }
      throw err;
    }
  });
});
