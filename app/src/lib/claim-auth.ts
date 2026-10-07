import { keccak256, toHex } from "viem";

export const CLAIM_AUTH_DOMAIN = "Doro Gift Claim";
export const CLAIM_AUTH_VERSION = "1";

/**
 * Deterministic challenge text the claimant signs with their own wallet to
 * prove control of `recipient`.
 *
 * Why this is required: the contract enforces `msg.sender == recipient`, so a
 * voucher must name the exact address that will broadcast the claim. Letting
 * the client simply declare that address would let anyone request a voucher
 * payable to their own wallet and drain every escrow — the identity-spoofing
 * hole that ARCHITECTURE.md section 9 requires be closed. Requiring a valid
 * signature from `recipient` proves control without weakening the handle check.
 */
export function buildClaimAuthMessage(params: {
  recipient: `0x${string}`;
  tipId: bigint;
  chainId: number;
}): string {
  const { recipient, tipId, chainId } = params;

  return [
    `${CLAIM_AUTH_DOMAIN} v${CLAIM_AUTH_VERSION}`,
    `Address: ${recipient.toLowerCase()}`,
    `Gift: ${tipId.toString()}`,
    `Chain: ${chainId.toString()}`,
    "",
    "Sign to prove you control this wallet and may claim this gift.",
    "This does not move any funds.",
  ].join("\n");
}

export const SENDER_AUTH_DOMAIN = "Doro Sender Name";

/**
 * Challenge a sender signs to attach their X name to a gift.
 *
 * Optional and display-only: it proves control of `sender` so the name shown
 * on the card is not self-asserted. It carries no authority — it cannot move
 * money and the recipient does not need to trust it. Bound to the sender
 * address and chain so a signature cannot be lifted onto a different wallet.
 */
export function buildSenderAuthMessage(params: {
  sender: `0x${string}`;
  chainId: number;
}): string {
  const { sender, chainId } = params;

  return [
    SENDER_AUTH_DOMAIN,
    `Address: ${sender.toLowerCase()}`,
    `Chain: ${chainId.toString()}`,
    "",
    "Sign to show your X name on this gift card.",
    "This does not move any funds.",
  ].join("\n");
}

/** Message digest used for off-chain ownership proofs (EIP-191). */
export function claimAuthDigest(message: string): `0x${string}` {
  return keccak256(toHex(message));
}

export function isSameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
