/**
 * Picking which Privy-connected wallet the app should actually use.
 *
 * Privy returns every wallet linked to the session, in no guaranteed order.
 * Taking the last element picks whichever one happens to sit at the end of the
 * array, which is how a recipient ends up claiming into an embedded Privy
 * wallet instead of the one they just connected.
 *
 * Two rules, in order:
 *   1. Ignore embedded wallets. They are a Privy-provisioned key, not
 *      something the user chose, and this app's whole model is "your wallet,
 *      your funds".
 *   2. Among the rest, take the most recently connected one.
 */

export type WalletCandidate = {
  address: string;
  walletClientType: string;
  connectorType?: string;
  /** Privy's "first connected and not since broken" timestamp, in seconds. */
  connectedAt?: number;
};

/** `walletClientType` values Privy uses for wallets it provisions itself. */
export const EMBEDDED_CLIENT_TYPES = ["privy"];

export function isEmbeddedWallet(wallet: WalletCandidate): boolean {
  return EMBEDDED_CLIENT_TYPES.includes(wallet.walletClientType);
}

/**
 * The wallet to sign with, or null when there is nothing usable.
 *
 * Ties on `connectedAt` are broken by array order so the result is stable
 * across re-renders rather than flipping between two equally-recent wallets.
 */
export function pickActiveWallet(wallets: WalletCandidate[]): WalletCandidate | null {
  const external = wallets.filter((w) => w && !isEmbeddedWallet(w));
  if (external.length === 0) return null;
  if (external.length === 1) return external[0];

  let best = external[0];
  for (const wallet of external.slice(1)) {
    const a = best.connectedAt ?? 0;
    const b = wallet.connectedAt ?? 0;
    if (b > a) best = wallet;
  }
  return best;
}
