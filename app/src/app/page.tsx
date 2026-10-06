"use client";

import React, { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  parseEther,
  createWalletClient,
  createPublicClient,
  custom,
  http,
  parseEventLogs,
} from "viem";
import { monadTestnet } from "@/lib/chain";
import { TIPJAR_ABI, TIPJAR_ADDRESS } from "@/lib/tipjar";

export default function SendTipPage() {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("0.02");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdTip, setCreatedTip] = useState<{
    tipId?: number;
    txHash: string;
    handle: string;
    amount: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage("");

    if (!handle.trim()) {
      setError("Please enter a valid X (Twitter) handle.");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0.01) {
      setError("Minimum tip amount is 0.01 MON.");
      return;
    }

    if (!authenticated || wallets.length === 0) {
      login();
      return;
    }

    try {
      setLoading(true);

      // Step 1: Hash handle securely via backend API
      setStatusMessage("Securing recipient commitment with server salt...");
      const hashRes = await fetch("/api/hash-handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });

      const hashData = await hashRes.json();
      if (!hashRes.ok) {
        throw new Error(hashData.message || "Failed to hash handle.");
      }

      const { handleHash, handle: cleanHandle } = hashData;

      // Step 2: Send transaction on Monad Testnet
      setStatusMessage("Please confirm transaction in your wallet...");
      const activeWallet = wallets[0];
      await activeWallet.switchChain(monadTestnet.id);

      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        chain: monadTestnet,
        transport: custom(provider),
      });

      const valueWei = parseEther(amount);

      const hash = await walletClient.writeContract({
        address: TIPJAR_ADDRESS,
        abi: TIPJAR_ABI,
        functionName: "createTip",
        args: [handleHash],
        value: valueWei,
        account: activeWallet.address as `0x${string}`,
      });

      setStatusMessage("Transaction submitted! Waiting for Monad confirmation...");

      let tipId: number | undefined;
      try {
        const publicClient = createPublicClient({
          chain: monadTestnet,
          transport: http("https://testnet-rpc.monad.xyz"),
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const logs = parseEventLogs({
          abi: TIPJAR_ABI,
          logs: receipt.logs,
          eventName: "TipCreated",
        });
        if (logs.length > 0 && logs[0].args?.tipId !== undefined) {
          tipId = Number(logs[0].args.tipId);
        }
      } catch (receiptErr) {
        console.warn("Could not parse receipt logs for tipId:", receiptErr);
      }

      setCreatedTip({
        tipId,
        txHash: hash,
        handle: cleanHandle,
        amount,
      });

      setLoading(false);
      setStatusMessage("");
    } catch (err: any) {
      console.error("Tip creation failed:", err);
      setError(err?.shortMessage || err?.message || "Transaction failed.");
      setLoading(false);
      setStatusMessage("");
    }
  };

  return (
    <div className="w-full max-w-xl flex flex-col items-center">
      {/* Hero Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-monad-purple/10 border border-monad-purple/30 text-xs font-semibold text-monad-purple mb-4">
          ⚡ Native Monad Escrow
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-3">
          Tip Any X Account
        </h1>
        <p className="text-zinc-400 text-sm sm:text-base max-w-md mx-auto">
          Lock native MON for any Twitter handle. The recipient logs in with X via Privy, derives an
          embedded wallet, and claims on-chain.
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full bg-monad-card/90 rounded-2xl border border-monad-border p-6 sm:p-8 glow-purple backdrop-blur-xl">
        {createdTip ? (
          <div className="flex flex-col items-center text-center space-y-4 py-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-2xl">
              🎉
            </div>
            <h3 className="text-xl font-bold text-white">Tip Created Successfully!</h3>
            <p className="text-sm text-zinc-400">
              You locked <span className="font-bold text-white">{createdTip.amount} MON</span> for{" "}
              <span className="font-bold text-monad-cyan">@{createdTip.handle}</span>.
              {createdTip.tipId !== undefined && (
                <span className="block text-xs font-mono text-monad-purple mt-1">
                  Assigned Tip ID: #{createdTip.tipId}
                </span>
              )}
            </p>

            <div className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-left text-xs font-mono break-all text-zinc-300">
              <span className="text-zinc-500 block text-[10px] uppercase font-sans mb-1">
                Transaction Hash
              </span>
              <a
                href={`https://testnet.monadscan.com/tx/${createdTip.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-monad-purple hover:underline"
              >
                {createdTip.txHash}
              </a>
            </div>

            <div className="w-full p-4 rounded-xl bg-monad-purple/10 border border-monad-purple/30 text-left">
              <span className="text-xs font-bold text-monad-purple block mb-1">
                Shareable Claim Link:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={
                    typeof window !== "undefined"
                      ? `${window.location.origin}/claim/${createdTip.tipId !== undefined ? createdTip.tipId : 0}`
                      : `/claim/${createdTip.tipId !== undefined ? createdTip.tipId : 0}`
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-mono"
                />
                <button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      const link = `${window.location.origin}/claim/${createdTip.tipId !== undefined ? createdTip.tipId : 0}`;
                      navigator.clipboard.writeText(link);
                      alert("Claim link copied to clipboard!");
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-monad-purple text-xs font-bold text-white hover:bg-monad-purple/80"
                >
                  Copy
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setCreatedTip(null);
                setHandle("");
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition"
            >
              Send Another Tip
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Recipient X (Twitter) Handle
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-base">
                  @
                </span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="elonmusk"
                  disabled={loading}
                  className="w-full pl-8 pr-4 py-3 rounded-xl bg-zinc-900/90 border border-monad-border text-white placeholder-zinc-600 focus:outline-none focus:border-monad-purple transition text-sm font-medium"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Tip Amount (Native MON)
                </label>
                <span className="text-[11px] text-zinc-500">Min 0.01 MON</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/90 border border-monad-border text-white placeholder-zinc-600 focus:outline-none focus:border-monad-purple transition text-sm font-mono font-semibold"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-monad-purple">
                  MON
                </span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {error}
              </div>
            )}

            {statusMessage && (
              <div className="p-3 rounded-xl bg-monad-purple/10 border border-monad-purple/30 text-monad-purple text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-monad-purple animate-ping"></span>
                <span>{statusMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition shadow-lg ${
                loading
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-monad-purple to-indigo-600 hover:from-monad-purple/90 hover:to-indigo-500 text-white shadow-monad-purple/20 hover:scale-[1.01]"
              }`}
            >
              {loading
                ? "Processing..."
                : authenticated
                ? `Send ${amount} MON Tip`
                : "Connect Wallet to Send"}
            </button>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-800/60">
              <span>Expiry: 7 Days (Sender refundable)</span>
              <span>Gas: Paid by sender from faucet MON</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
