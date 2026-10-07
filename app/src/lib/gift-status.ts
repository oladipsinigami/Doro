export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type GiftPhase = "missing" | "pending" | "refundable" | "claimed" | "refunded";

type GiftFields = {
  createdAt: bigint | number;
  expiresAt: bigint | number;
  claimed: boolean;
  claimedBy: string;
  amount: bigint | number;
};

/**
 * Tell a refund apart from a claim.
 *
 * `refund()` sets `claimed` and zeroes `amount`, and leaves `claimedBy` at
 * the zero address. `claim()` sets `claimedBy` to the recipient and keeps
 * the amount. That is the on-chain record until the contract is redeployed.
 */
export function classifyGift(tip: GiftFields, nowSeconds: number): GiftPhase {
  if (Number(tip.createdAt) === 0) return "missing";

  if (tip.claimed) {
    const claimedBy = tip.claimedBy.toLowerCase();
    const amount = BigInt(tip.amount);
    if (claimedBy === ZERO_ADDRESS && amount === 0n) return "refunded";
    return "claimed";
  }

  if (nowSeconds > Number(tip.expiresAt)) return "refundable";
  return "pending";
}

type CreatedLog = {
  args: {
    tipId?: bigint;
    sender?: string;
  };
};

/** Every tip id this sender created. No trailing window. Newest first. */
export function tipIdsForSender(logs: CreatedLog[], sender: string): number[] {
  const want = sender.toLowerCase();
  const ids = new Set<number>();

  for (const log of logs) {
    if (!log.args.sender || log.args.sender.toLowerCase() !== want) continue;
    if (log.args.tipId === undefined) continue;
    ids.add(Number(log.args.tipId));
  }

  return [...ids].sort((a, b) => b - a);
}

type RefundLog = {
  args: {
    tipId?: bigint;
    sender?: string;
    amount?: bigint;
  };
};

/** Amounts from TipRefunded, keyed by tip id. Refunds zero the stored amount. */
export function refundAmountsForSender(logs: RefundLog[], sender: string): Map<number, bigint> {
  const want = sender.toLowerCase();
  const amounts = new Map<number, bigint>();

  for (const log of logs) {
    if (!log.args.sender || log.args.sender.toLowerCase() !== want) continue;
    if (log.args.tipId === undefined || log.args.amount === undefined) continue;
    amounts.set(Number(log.args.tipId), log.args.amount);
  }

  return amounts;
}

/**
 * Ids to read when the log query fails. Newest first.
 * `truncated` is true when older gifts were left out, so the UI can say so.
 */
export function fallbackTipIds(
  nextTipId: number,
  cap = 200
): { ids: number[]; truncated: boolean } {
  const count = Number.isFinite(nextTipId) ? Math.max(0, Math.floor(nextTipId)) : 0;
  const start = Math.max(0, count - cap);
  const ids: number[] = [];
  for (let i = count - 1; i >= start; i--) ids.push(i);
  return { ids, truncated: start > 0 };
}

/** "Refundable in 4d 2h" while the gift is still open. */
export function refundWindowLabel(expiresAt: number, nowSeconds: number): string {
  const secs = expiresAt - nowSeconds;
  if (secs <= 0) return "Refundable now";
  const days = Math.floor(secs / 86_400);
  const hours = Math.floor((secs % 86_400) / 3_600);
  if (days > 0) return `Refundable in ${days}d ${hours}h`;
  const mins = Math.floor((secs % 3_600) / 60);
  return `Refundable in ${hours}h ${mins}m`;
}
