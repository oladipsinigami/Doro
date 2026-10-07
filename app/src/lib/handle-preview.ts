/** X handles: 1-15 chars, alphanumeric + underscore. Mirrors the API's rule. */
const HANDLE_PATTERN = /^[a-z0-9_]{1,15}$/;

/**
 * Normalizes a typed handle the same way the API does, so the preview cannot
 * disagree with the hash that gets locked on-chain.
 */
export function normalizePreviewHandle(raw: string): string | null {
  const clean = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!HANDLE_PATTERN.test(clean)) return null;
  return clean;
}

export type AvatarState = "idle" | "loading" | "found" | "missing" | "error";

export type RecipientProfile = {
  /** Canonical handle as X reports it, not as typed. */
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type AvatarPreview = {
  state: AvatarState;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * Profile lookup for a handle.
 *
 * Existence is judged on the response *body*, never the status code. Two
 * reasons, both verified:
 *
 * 1. `redirect: "manual"` cannot be used. For a cross-origin request the
 *    browser returns an opaque filtered response with `status: 0`, so status
 *    checks always fail in the browser while passing under Node.
 * 2. The upstream status is not stable. A real account has been observed
 *    returning both 200 (JSON profile) and 404 (JSON without a user), so status
 *    alone is unreliable even server-side.
 *
 * Following the redirect, a real account yields JSON containing `user`; an
 * unknown one yields an HTML page. Parsing discriminates them reliably.
 *
 * Browser-side on purpose: keeps typed handles out of our server logs and
 * avoids making us an open proxy. Avatars are user-controlled and copyable, so
 * this is a spelling check, never proof of handle ownership.
 */
export function parseProfileBody(text: string): RecipientProfile | null {
  let body: { user?: { screen_name?: string; name?: string; avatar_url?: string } };

  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON means the upstream served its fallback HTML page.
    return null;
  }

  const user = body?.user;
  if (!user || typeof user.screen_name !== "string" || user.screen_name.length === 0) {
    return null;
  }

  return {
    handle: user.screen_name,
    displayName: typeof user.name === "string" ? user.name : null,
    avatarUrl:
      typeof user.avatar_url === "string" && user.avatar_url.startsWith("https://")
        ? user.avatar_url
        : null,
  };
}

export async function fetchRecipientProfile(
  handle: string,
  signal?: AbortSignal
): Promise<RecipientProfile | null> {
  const res = await fetch(
    `https://api.fxtwitter.com/${encodeURIComponent(handle)}`,
    { signal }
  );

  return parseProfileBody(await res.text());
}

export function buildPreview(
  raw: string,
  loadState: AvatarState,
  profile: RecipientProfile | null = null
): AvatarPreview {
  const handle = normalizePreviewHandle(raw);

  if (handle === null || loadState === "idle") {
    return { state: "idle", handle: "", displayName: null, avatarUrl: null };
  }

  if (loadState === "loading") {
    return { state: "loading", handle, displayName: null, avatarUrl: null };
  }

  return {
    state: loadState,
    // Trust X's canonical spelling over the typed one.
    handle: profile?.handle ?? handle,
    displayName: profile?.displayName ?? null,
    avatarUrl: loadState === "found" ? profile?.avatarUrl ?? null : null,
  };
}