import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { createPublicClient, http } from "viem";
import { monadTestnet } from "@/lib/chain";
import { TIPJAR_ABI, TIPJAR_ADDRESS } from "@/lib/tipjar";
import { hashHandle } from "@/lib/signer";
import { findTwitterUsername } from "@/lib/privy-user";
import { identityLimiter } from "@/lib/voucher-limit";

const privyAppId = process.env.PRIVY_APP_ID || "";
const privyAppSecret = process.env.PRIVY_APP_SECRET || "";

const privy = new PrivyClient({ appId: privyAppId, appSecret: privyAppSecret });

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"),
});

/**
 * Is this gift addressed to me?
 *
 * The client cannot answer this alone. It would need the server-side salt to
 * hash the caller's handle, which the browser must never have. Here the handle
 * comes from a verified Privy session, is hashed with the salt, and compared to
 * the on-chain commitment. Nothing is signed.
 *
 * The caller already learns the answer by attempting a claim, so this returns no
 * information that was not already observable. It exists so the UI can route
 * someone to the right gift instead of letting them fail.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const accessToken = body?.accessToken;
    const identityToken = body?.identityToken;
    const tipIdRaw = body?.tipId;

    if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "accessToken is required." },
        { status: 400 }
      );
    }

    const tipId = typeof tipIdRaw === "number" ? tipIdRaw : Number(tipIdRaw);
    if (!Number.isInteger(tipId) || tipId < 0) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "tipId must be a non-negative integer." },
        { status: 400 }
      );
    }

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
    if (typeof identityToken === "string") {
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

    const tip = (await publicClient.readContract({
      address: TIPJAR_ADDRESS,
      abi: TIPJAR_ABI,
      functionName: "getTip",
      args: [BigInt(tipId)],
    })) as { createdAt: number; handleHash: `0x${string}` };

    if (Number(tip.createdAt) === 0) {
      return NextResponse.json(
        { error: "TIP_NOT_FOUND", message: `Gift #${tipId} does not exist.` },
        { status: 404 }
      );
    }

    const mine = hashHandle(twitterUsername).toLowerCase() === tip.handleHash.toLowerCase();

    return NextResponse.json({ tipId, mine });
  } catch (error: any) {
    console.error("[/api/gift-owner] check failed:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Couldn't check that gift." },
      { status: 500 }
    );
  }
}