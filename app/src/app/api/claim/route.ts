import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/node";
import { createPublicClient, http } from "viem";
import { monadTestnet } from "@/lib/chain";
import { TIPJAR_ABI, TIPJAR_ADDRESS } from "@/lib/tipjar";
import { hashHandle, signTipClaimVoucher } from "@/lib/signer";

const privyAppId = process.env.PRIVY_APP_ID || "";
const privyAppSecret = process.env.PRIVY_APP_SECRET || "";

const privy = new PrivyClient({
  appId: privyAppId,
  appSecret: privyAppSecret,
});

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tipId, accessToken, identityToken } = body;

    // Step 1: Body schema validation (Never accept handle or recipient from body)
    if (tipId === undefined || tipId === null || !accessToken) {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "tipId and accessToken are required." },
        { status: 400 }
      );
    }

    // Step 2: Verify Access Token with Privy
    let verifiedClaims;
    try {
      verifiedClaims = await privy.utils().auth().verifyAuthToken(accessToken);
    } catch (err: any) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or expired access token." },
        { status: 401 }
      );
    }

    const userId = verifiedClaims.user_id;

    // Step 3: Load User Profile via identity token (with fallback to user lookup by DID)
    let user: any;
    if (identityToken) {
      try {
        user = await privy.users().get({ id_token: identityToken });
      } catch (e) {
        // Fallback: lookup user via Privy REST API
        if (privyAppId && privyAppSecret) {
          const authHeader = `Basic ${Buffer.from(`${privyAppId}:${privyAppSecret}`).toString("base64")}`;
          const res = await fetch(`https://api.privy.io/v1/users/${userId}`, {
            headers: {
              Authorization: authHeader,
              "privy-app-id": privyAppId,
            },
          });
          if (res.ok) {
            user = await res.json();
          }
        }
      }
    } else if (privyAppId && privyAppSecret) {
      const authHeader = `Basic ${Buffer.from(`${privyAppId}:${privyAppSecret}`).toString("base64")}`;
      const res = await fetch(`https://api.privy.io/v1/users/${userId}`, {
        headers: {
          Authorization: authHeader,
          "privy-app-id": privyAppId,
        },
      });
      if (res.ok) {
        user = await res.json();
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "Unable to load Privy user record." },
        { status: 401 }
      );
    }

    const linkedAccounts = user.linked_accounts || user.linkedAccounts || [];

    // Step 4: Extract linked X (Twitter) account
    const twitterAccount = linkedAccounts.find(
      (acc: any) => acc.type === "twitter"
    ) as any;

    if (!twitterAccount || !twitterAccount.username) {
      return NextResponse.json(
        {
          error: "TWITTER_NOT_LINKED",
          message: "An X (Twitter) account must be linked to your Privy login.",
        },
        { status: 403 }
      );
    }

    const twitterUsername = twitterAccount.username;

    // Step 5: Extract Privy Embedded Ethereum Wallet
    const embeddedWallet = linkedAccounts.find(
      (acc: any) =>
        acc.type === "wallet" &&
        (acc.wallet_client_type === "privy" || acc.walletClientType === "privy")
    ) as any;

    if (!embeddedWallet || !embeddedWallet.address) {
      return NextResponse.json(
        {
          error: "EMBEDDED_WALLET_MISSING",
          message: "Privy embedded wallet address not found.",
        },
        { status: 403 }
      );
    }

    const recipient = embeddedWallet.address as `0x${string}`;

    // Step 6: Query on-chain tip data from Monad Testnet
    const tipData = (await publicClient.readContract({
      address: TIPJAR_ADDRESS,
      abi: TIPJAR_ABI,
      functionName: "getTip",
      args: [BigInt(tipId)],
    })) as {
      sender: `0x${string}`;
      createdAt: number;
      expiresAt: number;
      claimed: boolean;
      handleHash: `0x${string}`;
      amount: bigint;
      claimedBy: `0x${string}`;
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

    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp > Number(tipData.expiresAt)) {
      return NextResponse.json(
        {
          error: "TIP_EXPIRED",
          message: `Tip #${tipId} expired and is refundable by the sender.`,
        },
        { status: 410 }
      );
    }

    // Step 7: Compare recomputed handle hash with server salt against on-chain handleHash
    const expectedHash = hashHandle(twitterUsername);
    if (expectedHash.toLowerCase() !== tipData.handleHash.toLowerCase()) {
      return NextResponse.json(
        {
          error: "HANDLE_MISMATCH",
          message: `Authenticated X account @${twitterUsername} does not match the tip recipient.`,
        },
        { status: 403 }
      );
    }

    // Step 8: Generate EIP-712 Claim Voucher (10-minute validity)
    const deadline = BigInt(currentTimestamp + 600);
    const signature = await signTipClaimVoucher(BigInt(tipId), recipient, deadline);

    return NextResponse.json({
      recipient,
      deadline: Number(deadline),
      signature,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: error?.message || "An unexpected error occurred processing the claim.",
      },
      { status: 500 }
    );
  }
}
