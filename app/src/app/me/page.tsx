"use client";

import React, { useState, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, formatEther, http, custom } from "viem";
import { monadTestnet } from "@/lib/chain";
import { TIPJAR_ABI, TIPJAR_ADDRESS } from "@/lib/tipjar";

export default function MyTipsPage() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const [tips, setTips] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refundingId, setRefundingId] = useState<number | null>(null);
  const [refundTx, setRefundTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeWallet = wallets[0];

  useEffect(() => {
    async function fetchTips() {
      if (!activeWallet?.address) return;
      try {
        setLoading(true);
        const publicClient = createPublicClient({
          chain: monadTestnet,
          transport: http("https://testnet-rpc.monad.xyz"),
        });

        // Read total tips created
        const nextId = (await publicClient.readContract({
          address: TIPJAR_ADDRESS,
          abi: TIPJAR_ABI,
          functionName: "nextTipId",
        })) as bigint;

        const userTips: any[] = [];
        const count = Number(nextId);

        // Fetch tips backwards up to 30 tips
        for (let i = Math.max(0, count - 30); i < count; i++) {
          const tip = (await publicClient.readContract({
            address: TIPJAR_ADDRESS,
            abi: TIPJAR_ABI,
            functionName: "getTip",
            args: [BigInt(i)],
          })) as any;

          if (tip.sender.toLowerCase() === activeWallet.address.toLowerCase()) {
            userTips.push({
              tipId: i,
              ...tip,
            });
          }
        }

        setTips(userTips.reverse());
      } catch (err) {
        console.error("Failed to load user tips:", err);
      } finally {
        setLoading(false);
      }
    }

    if (authenticated && activeWallet?.address) {
      fetchTips();
    }
  }, [authenticated, activeWallet?.address]);

  const handleRefund = async (tipId: number) => {
    setError(null);
    setRefundTx(null);

    if (!activeWallet) return;

    try {
      setRefundingId(tipId);
      await activeWallet.switchChain(monadTestnet.id);

      const provider = await activeWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        chain: monadTestnet,
        transport: custom(provider),
      });

      const hash = await walletClient.writeContract({
        address: TIPJAR_ADDRESS,
        abi: TIPJAR_ABI,
        functionName: "refund",
        args: [BigInt(tipId)],
        account: activeWallet.address as `0x${string}`,
      });

      setRefundTx(hash);
      // Update local state
      setTips((prev) =>
        prev.map((t) => (t.tipId === tipId ? { ...t, claimed: true, amount: 0n } : t))
      );
      setRefundingId(null);
    } catch (err: any) {
      console.error("Refund failed:", err);
      setError(err?.shortMessage || err?.message || "Refund failed.");
      setRefundingId(null);
    }
  };

  if (!ready) {
    return null;
  }

  if (!authenticated) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-white mb-3">Connect Your Wallet</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Connect your wallet to view gifts you have sent and execute refunds on expired gifts.
        </p>
        <button
          onClick={login}
          className="px-6 py-3 rounded-xl bg-monad-purple hover:bg-monad-purple/90 text-white font-semibold text-sm transition shadow-lg shadow-monad-purple/20"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="w-full max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">My Sent Gifts</h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Connected: <span className="font-mono text-zinc-300">{activeWallet?.address}</span>
          </p>
        </div>
      </div>

      {refundTx && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>Refund transaction confirmed!</span>
          <a
            href={`https://testnet.monadscan.com/tx/${refundTx}`}
            target="_blank"
            rel="noreferrer"
            className="font-bold underline hover:text-emerald-200"
          >
            View on Monadscan &rarr;
          </a>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-3 border-monad-purple/30 border-t-monad-purple rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-zinc-400 text-xs">Scanning Monad Testnet for your gifts...</p>
        </div>
      ) : tips.length === 0 ? (
        <div className="text-center py-16 bg-monad-card/60 rounded-2xl border border-monad-border p-8">
          <p className="text-zinc-400 text-sm mb-2">You haven&apos;t sent any gifts yet.</p>
          <a href="/" className="text-monad-purple font-semibold text-xs hover:underline">
            Send your first gift &rarr;
          </a>
        </div>
      ) : (
        <div className="bg-monad-card/80 rounded-2xl border border-monad-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 border-b border-monad-border text-zinc-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Gift ID</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {tips.map((t) => {
                  const isExpired = now > Number(t.expiresAt);
                  const canRefund = isExpired && !t.claimed;

                  return (
                    <tr key={t.tipId} className="hover:bg-zinc-900/40 transition">
                      <td className="py-3.5 px-4 font-bold text-white">#{t.tipId}</td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-zinc-200">
                        {formatEther(t.amount)} MON
                      </td>
                      <td className="py-3.5 px-4 text-zinc-400">
                        {new Date(Number(t.expiresAt) * 1000).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4">
                        {t.claimed && t.claimedBy !== "0x0000000000000000000000000000000000000000" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Claimed
                          </span>
                        ) : t.claimed && t.amount === 0n ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                            Refunded
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-monad-purple/10 text-monad-purple border border-monad-purple/20">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {canRefund ? (
                          <button
                            onClick={() => handleRefund(t.tipId)}
                            disabled={refundingId === t.tipId}
                            className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-[11px] transition border border-amber-500/40"
                          >
                            {refundingId === t.tipId ? "Refunding..." : "Refund"}
                          </button>
                        ) : (
                          <a
                            href={`/claim/${t.tipId}`}
                            className="text-monad-purple hover:underline font-medium text-[11px]"
                          >
                            View Link &rarr;
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
