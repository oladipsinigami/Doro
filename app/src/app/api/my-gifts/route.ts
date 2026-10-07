import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { createPublicClient, http } from "viem";
import { monadTestnet } from "@/lib/chain";
import { TIPJAR_ABI, TIPJAR_ADDRESS } from "@/lib/tipjar";
import { hashHandle } from "@/lib/signer";
import { findTwitterUsername } from "@/lib/privy-user";
import { findMyGifts, MAX_SCAN, type ScannableTip } from "@/lib/my-gifts";
import { extractClaimRequest } from "@/lib/claim-request";
import { identityLimiter } from "@/lib/voucher-limit";

const privyAppId = process.env.PRIVY_APP_ID || "";
const privyAppSecret = process.env.PRIVY_APP_SECRET || "";

const privy = new PrivyClient({ appId: privyAppId, appSecret: privyAppSecret });

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"),
});

/**
 * Find the open gifts addressed to the signed-in X handle.
 *
 * Privacy shape, which is the reason this is safe to expose:
 *
 *  - The handle comes from a verified Privy session, never from the request body.
 *  - The handle is hashed with the server-only salt and compared against the
 *    on-chain `handleHash`. It is never returned, logged, or persisted.
 *  - The response contains only tips whose hash matches *this* caller's handle.
 *    No other recipient's hash, amount, or existence is revealed.
 *
 * A sender has no way to notify an offline recipient, so this is how someone
 * discovers a gift that arrived without a link.
 *
 * Voucher issuance is deliberately NOT part of this endpoint. It returns claim
 * paths only; the claimant still goes through /api/claim/wallet with a wallet
 * ownership proof.
 */
export async function POST(req: Request) {
  try {
    const parsed = extractClaimRequest({ tipId: 0, ...(await req.json().catch(() => ({}))) });
    if (!parsed.ok) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "accessToken is required." },
        { status: 400 }
      );
    }

    const { accessToken, identityToken } = parsed.value;

    const gate = identityLimiter.check(accessToken);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: "RATE_LIMITED", message: "Too many requests. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } }
      );
    }

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
        { error: "TWITTER_NOT_LINKED", message: "No X account is linked to this login." },
        { status: 403 }
      );
    }

    const nextTipId = Number(
      await publicClient.readContract({
        address: TIPJAR_ADDRESS,
        abi: TIPJAR_ABI,
        functionName: "nextTipId",
      })
    );

    if (!Number.isFinite(nextTipId) || nextTipId === 0) {
      return NextResponse.json({ gifts: [], scanned: 0, truncated: false });
    }

    const total = Math.min(nextTipId, MAX_SCAN);
    const start = nextTipId - total;
    const ids = Array.from({ length: total }, (_, i) => start + i);

    const readResults = await Promise.allSettled(
      ids.map((id) =>
        publicClient.readContract({
          address: TIPJAR_ADDRESS,
          abi: TIPJAR_ABI,
          functionName: "getTip",
          args: [BigInt(id)],
        })
      )
    );

    const tips: ScannableTip[] = [];
    for (let i = 0; i < readResults.length; i++) {
      const result = readResults[i];
      if (result.status !== "fulfilled") continue;

      const t = result.value as {
        sender: `0x${string}`;
        createdAt: bigint | number;
        expiresAt: bigint | number;
        claimed: boolean;
        handleHash: `0x${string}`;
        amount: bigint;
        claimedBy: `0x${string}`;
      };

      // createdAt === 0 means the id was never used.
      if (Number(t.createdAt) === 0) continue;

      tips.push({
        tipId: ids[i],
        sender: t.sender,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
        claimed: t.claimed,
        claimedBy: t.claimedBy,
        amount: t.amount,
        handleHash: t.handleHash,
      });
    }

    const mine = findMyGifts(tips, hashHandle(twitterUsername), Math.floor(Date.now() / 1000));

    return NextResponse.json({
      gifts: mine.gifts.map((g) => ({
        tipId: g.tipId,
        amount: g.amount.toString(),
        expiresAt: g.expiresAt,
        sender: g.sender,
        claimPath: g.claimPath,
      })),
      scanned: mine.scanned,
      truncated: mine.truncated || start > 0,
    });
  } catch (error: any) {
    console.error("[/api/my-gifts] lookup failed:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Couldn't look up your gifts." },
      { status: 500 }
    );
  }
}