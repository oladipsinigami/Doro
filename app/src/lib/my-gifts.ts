// Extension is explicit so this module loads under the Node test runner, which
// does not resolve extensionless TypeScript imports. Same reason as gift-link.ts.
import { classifyGift } from "./gift-status.ts";

type GiftFields = {
  createdAt: bigint | number;
  expiresAt: bigint | number;
  claimed: boolean;
  claimedBy: string;
  amount: bigint | number;
};

/**
 * Match a signed-in recipient's open gifts out of the on-chain tip set.
 *
 * A gift is "mine" when its on-chain `handleHash` equals the salted hash of the
 * X handle from my Privy session. The hash is computed server-side, so this
 * function never sees a handle and never learns anyone else's hash.
 *
 * Only open gifts are returned. Claimed and refunded tips are terminal; showing
 * them would be noise and would invite a pointless claim attempt.
 */
export type ScannableTip = GiftFields & {
  tipId: number;
  handleHash: string;
  sender: string;
};

export type MyGift = {
  tipId: number;
  amount: bigint;
  expiresAt: number;
  sender: string;
  /** Where the recipient's own wallet should receive the funds. */
  claimPath: string;
};

export type MatchResult = {
  gifts: MyGift[];
  /** Tips examined, so the UI can be honest about coverage. */
  scanned: number;
  /** True when the scan window did not reach the oldest tips. */
  truncated: boolean;
};

/**
 * Tips are sequential, so a cap means older gifts are not examined.
 * The UI must say so rather than implying "these are all of them".
 */
export const MAX_SCAN = 500;

export function findMyGifts(
  tips: ScannableTip[],
  myHandleHash: string,
  nowSeconds: number
): MatchResult {
  const mine = myHandleHash.toLowerCase();

  const gifts: MyGift[] = [];

  for (const tip of tips) {
    if (tip.handleHash.toLowerCase() !== mine) continue;

    // Terminal states are not claimable. Reuse the contract-shaped classifier so
    // the "already claimed" reading matches the rest of the app.
    const phase = classifyGift(tip, nowSeconds);
    if (phase !== "pending") continue;

    gifts.push({
      tipId: tip.tipId,
      amount: BigInt(tip.amount),
      expiresAt: Number(tip.expiresAt),
      sender: tip.sender,
      claimPath: `/claim/${tip.tipId}`,
    });
  }

  gifts.sort((a, b) => b.tipId - a.tipId);

  return {
    gifts,
    scanned: tips.length,
    truncated: tips.length >= MAX_SCAN,
  };
}

/** "Expires in 6d 23h" for a gift that is waiting. */
export function expiryLabel(expiresAt: number, nowSeconds: number): string {
  const secs = expiresAt - nowSeconds;
  if (secs <= 0) return "Expiring now";

  const days = Math.floor(secs / 86_400);
  const hours = Math.floor((secs % 86_400) / 3_600);
  if (days > 0) return `Expires in ${days}d ${hours}h`;

  const mins = Math.floor((secs % 3_600) / 60);
  if (hours > 0) return `Expires in ${hours}h ${mins}m`;
  return `Expires in ${mins}m`;
}