"use client";

import React, { useEffect, useState, use } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, formatEther, custom, http } from "viem";
import { monadTestnet } from "@/lib/chain";
import { TIPJAR_ABI, TIPJAR_ADDRESS } from "@/lib/tipjar";

export default function ClaimTipPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const tipId = resolvedParams.id;

  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const { wallets } = useWallets();

  const [tipData, setTipData] = useState<any>(null);
  const [loadingTip, setLoadingTip] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccessTx, setClaimSuccessTx] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const twitterAccount = (user?.linkedAccounts as any[])?.find(
    (a: any) => a.type === "twitter_oauth" || a.type === "twitter"
  ) as any;
  const twitterUsername = user?.twitter?.username || twitterAccount?.username || twitterAccount?.name;
  const embeddedWallet = (user?.linkedAccounts as any[])?.find(
    (a: any) => a.type === "wallet" && a.walletClientType === "privy"
  ) as any;

  // Load Tip Data from Monad Testnet
  useEffect(() => {
    async function loadTip() {
      try {
        setLoadingTip(true);
        const publicClient = createPublicClient({
          chain: monadTestnet,
          transport: http("https://testnet-rpc.monad.xyz"),
        });

        const tip = (await publicClient.readContract({
          address: TIPJAR_ADDRESS,
          abi: TIPJAR_ABI,
          functionName: "getTip",
          args: [BigInt(tipId)],
        })) as any;

        setTipData(tip);

        // Fetch balance of embedded wallet if available
        if (embeddedWallet?.address) {
          const bal = await publicClient.getBalance({
            address: embeddedWallet.address as `0x${string}`,
          });
          setWalletBalance(bal);
        }
      } catch (err) {
        console.error("Failed to load tip:", err);
      } finally {
        setLoadingTip(false);
      }
    }

    if (tipId !== undefined) {
      loadTip();
    }
  }, [tipId, embeddedWallet?.address]);

  const handleClaim = async () => {
    setClaimError(null);
    setStatusMessage("");

    if (!authenticated) {
      login();
      return;
    }

    if (!twitterUsername) {
      setClaimError("Your Privy login does not have an X (Twitter) account linked.");
      return;
    }

    if (!embeddedWallet?.address) {
      setClaimError("No Privy embedded wallet found on your account.");
      return;
    }

    try {
      setClaiming(true);

      // Step 1: Obtain Privy session tokens
      setStatusMessage("Verifying X identity with server...");
      const accessToken = await getAccessToken();

      // Step 2: Request EIP-712 Voucher from /api/claim
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipId: Number(tipId),
          accessToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `Claim request rejected (${data.error || res.status})`);
      }

      const { recipient, deadline, signature } = data;

      // Step 3: Broadcast claim transaction using Privy embedded wallet
      setStatusMessage("Submitting claim transaction on Monad Testnet...");
      const privyWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
      if (!privyWallet) {
        throw new Error("Embedded wallet not found in connected wallets.");
      }

      await privyWallet.switchChain(monadTestnet.id);
      const provider = await privyWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        chain: monadTestnet,
        transport: custom(provider),
      });

      const hash = await walletClient.writeContract({
        address: TIPJAR_ADDRESS,
        abi: TIPJAR_ABI,
        functionName: "claim",
        args: [BigInt(tipId), recipient, BigInt(deadline), signature],
        account: recipient,
      });

      setClaimSuccessTx(hash);
      setStatusMessage("");
      setClaiming(false);
    } catch (err: any) {
      console.error("Claim error:", err);
      setClaimError(err?.shortMessage || err?.message || "Failed to claim tip.");
      setClaiming(false);
      setStatusMessage("");
    }
  };

  if (loadingTip) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-monad-purple/30 border-t-monad-purple rounded-full animate-spin mb-4"></div>
        <p className="text-zinc-400 text-sm">Querying Gift #{tipId} on Monad Testnet...</p>
      </div>
    );
  }

  const isNotFound = !tipData || Number(tipData.createdAt) === 0;
  const isClaimed = tipData && tipData.claimed;
  const isExpired = tipData && Math.floor(Date.now() / 1000) > Number(tipData.expiresAt);

  return (
    <div className="w-full max-w-xl flex flex-col items-center">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-monad-purple/10 border border-monad-purple/30 text-xs font-semibold text-monad-purple mb-4">
          🎁 Gift Escrow
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">Gift #{tipId}</h1>
        <p className="text-zinc-400 text-sm">
          Log in with your X (Twitter) account to receive your voucher and unwrap your native MON gift.
        </p>
      </div>

      <div className="w-full bg-monad-card/90 rounded-2xl border border-monad-border p-6 sm:p-8 glow-purple backdrop-blur-xl">
        {claimSuccessTx ? (
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-3xl">
              🎁
            </div>
            <h3 className="text-2xl font-black text-white">Gift Unwrapped Successfully!</h3>
            <p className="text-sm text-zinc-400">
              The MON gift has been transferred directly to your Privy embedded wallet.
            </p>
            <div className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-left text-xs font-mono break-all text-zinc-300">
              <span className="text-zinc-500 block text-[10px] uppercase font-sans mb-1">
                Monadscan Transaction Link
              </span>
              <a
                href={`https://testnet.monadscan.com/tx/${claimSuccessTx}`}
                target="_blank"
                rel="noreferrer"
                className="text-monad-purple hover:underline"
              >
                {claimSuccessTx}
              </a>
            </div>
          </div>
        ) : isNotFound ? (
          <div className="text-center py-6">
            <p className="text-rose-400 font-bold mb-2">Gift Not Found</p>
            <p className="text-xs text-zinc-500">
              Gift #{tipId} does not exist on the current Monad Testnet contract.
            </p>
          </div>
        ) : isClaimed ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3 text-xl">
              ✅
            </div>
            <p className="text-white font-bold text-lg mb-1">Already Claimed</p>
            <p className="text-xs text-zinc-400 mb-2">
              This gift has already been claimed and unwrapped by:
            </p>
            <code className="text-xs font-mono text-zinc-300 bg-zinc-900 px-3 py-1.5 rounded-lg border border-zinc-800">
              {tipData.claimedBy}
            </code>
          </div>
        ) : isExpired ? (
          <div className="text-center py-6">
            <p className="text-amber-400 font-bold mb-2">Gift Expired</p>
            <p className="text-xs text-zinc-400">
              This gift has passed its 7-day claim window and is now refundable by the sender.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Amount Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-monad-purple/20 to-indigo-900/20 border border-monad-purple/40 text-center">
              <span className="text-xs uppercase font-bold tracking-widest text-zinc-400 block mb-1">
                Gift Value
              </span>
              <span className="text-4xl font-black text-white">
                {formatEther(tipData.amount)} <span className="text-monad-purple text-2xl">MON</span>
              </span>
              <span className="block text-[11px] text-zinc-500 mt-1">
                From: {tipData.sender.slice(0, 6)}...{tipData.sender.slice(-4)}
              </span>
            </div>

            {/* Authenticated Account Info */}
            {authenticated && (
              <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Logged-in X Handle:</span>
                  <span className="font-bold text-monad-cyan">
                    @{twitterUsername || "Not linked"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Embedded Wallet:</span>
                  <span className="font-mono text-zinc-300">
                    {embeddedWallet?.address
                      ? `${embeddedWallet.address.slice(0, 6)}...${embeddedWallet.address.slice(-4)}`
                      : "None"}
                  </span>
                </div>
                {walletBalance !== null && (
                  <div className="flex justify-between items-center pt-1 border-t border-zinc-800/60">
                    <span className="text-zinc-500">Wallet Gas Balance:</span>
                    <span className="font-mono font-bold text-zinc-300">
                      {formatEther(walletBalance)} MON
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Gas Warning Banner */}
            {authenticated && walletBalance !== null && walletBalance < 5000000000000000n && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">⚠️ Gas required to claim (~0.001 MON)</span>
                  <a
                    href="https://faucet.monad.xyz"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold underline hover:text-amber-200"
                  >
                    Open Faucet &rarr;
                  </a>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Your embedded claimer wallet needs a tiny amount of MON for gas. Copy your address below to request testnet tokens from the faucet:
                </p>
                {embeddedWallet?.address && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="font-mono text-[11px] text-zinc-300 bg-zinc-900 px-2 py-1 rounded truncate flex-1 border border-zinc-800">
                      {embeddedWallet.address}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(embeddedWallet.address);
                        setCopiedAddress(true);
                        setTimeout(() => setCopiedAddress(false), 2000);
                      }}
                      className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-bold transition whitespace-nowrap"
                    >
                      {copiedAddress ? "✓ Copied" : "Copy Address"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {claimError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {claimError}
              </div>
            )}

            {statusMessage && (
              <div className="p-3 rounded-xl bg-monad-purple/10 border border-monad-purple/30 text-monad-purple text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-monad-purple animate-ping"></span>
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Claim Action Button */}
            {!authenticated ? (
              <button
                onClick={login}
                className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide bg-gradient-to-r from-monad-purple to-indigo-600 hover:from-monad-purple/90 hover:to-indigo-500 text-white shadow-lg shadow-monad-purple/20 transition hover:scale-[1.01]"
              >
                Login with X (Twitter) to Claim Gift
              </button>
            ) : (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition shadow-lg ${
                  claiming
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/20 hover:scale-[1.01]"
                }`}
              >
                {claiming
                  ? "Unwrapping Gift..."
                  : `Unwrap & Claim ${formatEther(tipData.amount)} MON`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
