import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { createPublicClient, http, recoverMessageAddress, isAddress } from "viem";
import { monadTestnet } from "@/lib/chain";
import { TIPJAR_ABI, TIPJAR_ADDRESS } from "@/lib/tipjar";
import { hashHandle, signTipClaimVoucher } from "@/lib/signer";
import { extractWalletClaimRequest } from "@/lib/claim-request";
import { findTwitterUsername } from "@/lib/privy-user";
import { buildClaimAuthMessage } from "@/lib/claim-auth";
import { identityLimiter, voucherLimiter } from "@/lib/voucher-limit";

const privyAppId = process.env.PRIVY_APP_ID || "";
const privyAppSecret = process.env.PRIVY_APP_SECRET || "";

const privy = new PrivyClient({ appId: privyAppId, appSecret: privyAppSecret });

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"),
});

/**
 * Claim with an external wallet (MetaMask, Rabby, anything EIP-1193).
 *
 * Two independent proofs are required before a voucher is signed:
 *
 *  1. Privy X login proves handle ownership. Without it, anyone could claim
 *     any gift.
 *  2. A signature over buildClaimAuthMessage() proves the caller controls
 *     `recipient`. Without it, an authenticated user could direct a gift to a
 *     wallet they do not control, which would defeat the contract's
 *     `msg.sender == recipient` check.
 *
 * Both must hold. Recipients still need gas in their own wallet, which is the
 * point: no Privy wallet provisioning required.
 */
export async function POST(req: Request) {
  try {
    const parsed = extractWalletClaimRequest(await req.json().catch(() => null));

    if (!parsed.ok) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "tipId, accessToken, recipient and recipientSignature are required." },
        { status: 400 }
      );
    }

    const { tipId, accessToken, identityToken, recipient, recipientSignature } = parsed.value;

    if (!isAddress(recipient, { strict: false })) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "recipient must be a valid EVM address." },
        { status: 400 }
      );
    }

    const identityGate = identityLimiter.check(accessToken);
    if (!identityGate.allowed) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Too many claim attempts. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(identityGate.retryAfterSeconds) } }
      );
    }

    // --- Proof 1: Privy X handle ownership ---
    let verifiedClaims;
    try {
      verifiedClaims = await privy.utils().auth().verifyAuthToken(accessToken);
    } catch {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or expired access token." },
        { status: 401 }
      );
    }

    const userId = verifiedClaims.user_id;

    let user: any;
    const authHeader = `Basic ${Buffer.from(`${privyAppId}:${privyAppSecret}`).toString("base64")}`;
    if (identityToken) {
      try {
        user = await privy.users().get({ id_token: identityToken });
      } catch {
        user = undefined;
      }
    }
    if (!user && privyAppId && privyAppSecret) {
      const res = await fetch(`https://api.privy.io/v1/users/${userId}`, {
        headers: { Authorization: authHeader, "privy-app-id": privyAppId },
      });
      if (res.ok) user = await res.json();
    }

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "Unable to load Privy user record." },
        { status: 401 }
      );
    }

    const twitterUsername = findTwitterUsername(user);
    if (!twitterUsername) {
      return NextResponse.json(
        { error: "TWITTER_NOT_LINKED", message: "An X (Twitter) account must be linked to your Privy login." },
        { status: 403 }
      );
    }

    // --- Proof 2: caller controls `recipient` ---
    const authMessage = buildClaimAuthMessage({
      recipient,
      tipId,
      chainId: monadTestnet.id,
    });

    let recovered: string;
    try {
      recovered = await recoverMessageAddress({
        message: authMessage,
        signature: recipientSignature,
      });
    } catch {
      return NextResponse.json(
        { error: "BAD_SIGNATURE", message: "Could not verify the wallet signature." },
        { status: 400 }
      );
    }

    if (recovered.toLowerCase() !== recipient.toLowerCase()) {
      return NextResponse.json(
        {
          error: "SIGNATURE_MISMATCH",
          message: "The supplied signature does not prove control of that wallet.",
        },
        { status: 403 }
      );
    }

    // --- On-chain tip state ---
    const tipData = (await publicClient.readContract({
      address: TIPJAR_ADDRESS,
      abi: TIPJAR_ABI,
      functionName: "getTip",
      args: [tipId],
    })) as {
      sender: `0x${string}`;
      createdAt: number;
      expiresAt: number;
      claimed: boolean;
      handleHash: `0x${string}`;
      amount: bigint;
    };

    if (Number(tipData.createdAt) === 0) {
      return NextResponse.json(
        { error: "TIP_NOT_FOUND", message: `Tip #${tipId} does not exist.` },
        { status: 404 }
      );
    }
    if (tipData.claimed) {
      return NextResponse.json(
        { error: "ALREADY_CLAIMED", message: `Tip #${tipId} has already been claimed.` },
        { status: 409 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > Number(tipData.expiresAt)) {
      return NextResponse.json(
        { error: "TIP_EXPIRED", message: `Tip #${tipId} expired and is refundable by the sender.` },
        { status: 410 }
      );
    }

    // --- Handle must match the on-chain commitment ---
    if (hashHandle(twitterUsername).toLowerCase() !== tipData.handleHash.toLowerCase()) {
      return NextResponse.json(
        {
          error: "HANDLE_MISMATCH",
          message: `Authenticated X account @${twitterUsername} does not match the tip recipient.`,
        },
        { status: 403 }
      );
    }

    // Same store as /api/claim. The slot is taken only when signing starts,
    // and given back if signing throws, so a bad proof above does not lock
    // the recipient out for a minute.
    const voucherGate = voucherLimiter.reserve(`tip:${tipId}:${userId}`);
    if (!voucherGate.allowed) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: `A claim voucher was recently issued for gift #${tipId}. Try again in ${voucherGate.retryAfterSeconds}s.`,
        },
        { status: 429, headers: { "Retry-After": String(voucherGate.retryAfterSeconds) } }
      );
    }

    const deadline = BigInt(now + 600);
    let signature: `0x${string}`;
    try {
      signature = await signTipClaimVoucher(tipId, recipient, deadline);
    } catch (signError) {
      voucherGate.release();
      throw signError;
    }

    return NextResponse.json({
      recipient,
      deadline: Number(deadline),
      signature,
    });
  } catch (error: any) {
    console.error("[/api/claim/wallet] claim failed:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to generate claim voucher." },
      { status: 500 }
    );
  }
}
