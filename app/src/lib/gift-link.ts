/** Matches the note field on the send form. */
export const GIFT_NOTE_MAX = 140;

/**
 * Courier ids that may appear on a claim link.
 * Kept as a literal so this module can load under the Node test runner,
 * which does not resolve extensionless TypeScript imports.
 * gift-link.test.ts checks this set against `MASCOTS`.
 */
const KNOWN_MASCOT_IDS = new Set([
  "doro-angel",
  "chog-cyber",
  "barista-bear",
  "star-bunny",
]);

export type ClaimPathResult =
  | { ok: true; url: string }
  | { ok: false; reason: "missing-tip-id" };

/**
 * Build the shareable claim URL.
 *
 * The courier and the note are not stored on-chain. They travel on this link.
 * A missing tip id is a hard failure: guessing from `nextTipId` can point the
 * recipient at somebody else's gift.
 */
export function buildClaimPath(input: {
  tipId: number | undefined;
  mascotId: string;
  note: string;
  /** Optional, self-reported. Shown on the card as unverified. */
  senderHandle?: string;
  /** Resolved from senderHandle on the sender's side; https only. */
  senderAvatarUrl?: string;
  origin?: string;
}): ClaimPathResult {
  if (input.tipId === undefined || !Number.isInteger(input.tipId) || input.tipId < 0) {
    return { ok: false, reason: "missing-tip-id" };
  }

  const params = new URLSearchParams();
  if (KNOWN_MASCOT_IDS.has(input.mascotId)) {
    params.set("m", input.mascotId);
  }

  const note = input.note.trim().slice(0, GIFT_NOTE_MAX);
  if (note) params.set("n", note);

  // Self-reported sender handle. Unverified by design: no public service maps a
  // wallet address to an X handle, so this cannot be proven without the sender
  // authenticating. The UI labels it as self-reported.
  const senderHandle = normalizeSenderHandle(input.senderHandle ?? "");
  if (senderHandle) params.set("f", senderHandle);

  // Resolved on the sender's side at send time and carried here, so the
  // recipient's browser makes no third-party request to render the card. The
  // handle is unverified, so a spoofed avatar is possible: the UI says so.
  const avatar = input.senderAvatarUrl?.trim();
  if (senderHandle && avatar && /^https:\/\/[^\s]+$/.test(avatar)) {
    params.set("fa", avatar);
  }

  const path = `/claim/${input.tipId}${params.size > 0 ? `?${params.toString()}` : ""}`;
  return { ok: true, url: input.origin ? `${input.origin}${path}` : path };
}

/** X handles: 1-15 chars, alphanumeric + underscore. */
const HANDLE_PATTERN = /^[a-z0-9_]{1,15}$/;

export function normalizeSenderHandle(raw: string): string | null {
  const clean = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!HANDLE_PATTERN.test(clean)) return null;
  return clean;
}

/**
 * Read the card details off a claim URL.
 * An unknown courier id falls back to Doro Angel. The note is plain text.
 */
export function readClaimCard(search: { get(name: string): string | null }): {
  mascotId: string;
  note: string;
  senderHandle: string | null;
  senderAvatarUrl: string | null;
} {
  const rawMascot = search.get("m") ?? "";
  const mascotId = KNOWN_MASCOT_IDS.has(rawMascot) ? rawMascot : "doro-angel";
  const note = (search.get("n") ?? "").trim().slice(0, GIFT_NOTE_MAX);
  const senderHandle = normalizeSenderHandle(search.get("f") ?? "");

  // Only accept a remote image URL. Blocks javascript: and data: payloads, which
  // a query string must never be able to inject into an <img src>.
  const rawAvatar = (search.get("fa") ?? "").trim();
  const senderAvatarUrl =
    senderHandle && /^https:\/\/[^\s]+$/.test(rawAvatar) ? rawAvatar : null;

  return { mascotId, note, senderHandle, senderAvatarUrl };
}
