"use client";

import React, { useState, useEffect } from "react";
import { formatEther, parseAbiItem } from "viem";
import { useWallet } from "@/context/WalletContext";
import { TIPJAR_ABI, TIPJAR_ADDRESS, TIPJAR_DEPLOY_BLOCK } from "@/lib/tipjar";
import {
  classifyGift,
  fallbackTipIds,
  refundAmountsForSender,
  refundWindowLabel,
  tipIdsForSender,
  type GiftPhase,
} from "@/lib/gift-status";

const TIP_CREATED = parseAbiItem(
  "event TipCreated(uint256 indexed tipId, address indexed sender, bytes32 indexed handleHash, uint256 amount, uint256 expiresAt)"
);
const TIP_REFUNDED = parseAbiItem(
  "event TipRefunded(uint256 indexed tipId, address indexed sender, uint256 amount)"
);

const KNOWN_DEPLOYMENT = "0xa7a9acac332c398b61f7459215fd4f5522686b88";

type GiftRow = {
  tipId: number;
  createdAt: bigint;
  expiresAt: bigint;
  amount: bigint;
  displayAmount: bigint;
  phase: GiftPhase;
};

const PHASE_LABEL: Record<Exclude<GiftPhase, "missing">, string> = {
  pending: "Pending",
  refundable: "Refundable",
  claimed: "Claimed",
  refunded: "Refunded",
};

export default function MyGiftsPage() {
  const {
    isConnected,
    address,
    openConnectModal,
    getWalletClient,
    publicClient,
    isCorrectNetwork,
    switchNetwork,
  } = useWallet();

  const [tips, setTips] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyNote, setHistoryNote] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<number | null>(null);
  const [refundTx, setRefundTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTips() {
      if (!address) return;
      try {
        setLoading(true);
        setLoadError(null);
        setHistoryNote(null);

        const fromBlock =
          TIPJAR_ADDRESS.toLowerCase() === KNOWN_DEPLOYMENT ? TIPJAR_DEPLOY_BLOCK : 0n;

        let ids: number[] = [];
        let refundAmounts = new Map<number, bigint>();

        try {
          const [createdLogs, refundLogs] = await Promise.all([
            publicClient.getLogs({
              address: TIPJAR_ADDRESS,
              event: TIP_CREATED,
              args: { sender: address },
              fromBlock,
              toBlock: "latest",
            }),
            publicClient.getLogs({
              address: TIPJAR_ADDRESS,
              event: TIP_REFUNDED,
              args: { sender: address },
              fromBlock,
              toBlock: "latest",
            }),
          ]);
          ids = tipIdsForSender(createdLogs, address);
          refundAmounts = refundAmountsForSender(refundLogs, address);
        } catch (logErr) {
          console.error("Gift log query failed:", logErr);
          const nextId = (await publicClient.readContract({
            address: TIPJAR_ADDRESS,
            abi: TIPJAR_ABI,
            functionName: "nextTipId",
          })) as bigint;
          const fallback = fallbackTipIds(Number(nextId));
          ids = fallback.ids;
          setHistoryNote(
            fallback.truncated
              ? "The chain log query failed. Showing the latest 200 gifts. Older ones may be missing."
              : "The chain log query failed. Showing every gift id on the contract."
          );
        }

        const now = Math.floor(Date.now() / 1000);
        const rows: GiftRow[] = [];

        for (let i = 0; i < ids.length; i += 8) {
          const chunk = ids.slice(i, i + 8);
          const loaded = await Promise.all(
            chunk.map(async (tipId) => {
              const tip = (await publicClient.readContract({
                address: TIPJAR_ADDRESS,
                abi: TIPJAR_ABI,
                functionName: "getTip",
                args: [BigInt(tipId)],
              })) as any;

              if (tip.sender.toLowerCase() !== address.toLowerCase()) return null;
              const phase = classifyGift(tip, now);
              if (phase === "missing") return null;
              const amount = BigInt(tip.amount);
              const refunded = refundAmounts.get(tipId);
              return {
                tipId,
                createdAt: BigInt(tip.createdAt),
                expiresAt: BigInt(tip.expiresAt),
                amount,
                displayAmount: phase === "refunded" && refunded !== undefined ? refunded : amount,
                phase,
              } satisfies GiftRow;
            })
          );
          for (const row of loaded) {
            if (row) rows.push(row);
          }
        }

        rows.sort((a, b) => b.tipId - a.tipId);
        setTips(rows);
      } catch (err) {
        console.error("Failed to load user gifts:", err);
        setLoadError("Couldn't load gifts from Monad.");
      } finally {
        setLoading(false);
      }
    }

    if (isConnected && address) {
      fetchTips();
    }
  }, [isConnected, address, publicClient]);

  const handleRefund = async (tipId: number) => {
    setError(null);
    setRefundTx(null);

    if (!isConnected || !address) {
      openConnectModal();
      return;
    }

    if (!isCorrectNetwork) {
      try {
        await switchNetwork();
      } catch {
        setError("Switch to Monad Testnet to refund.");
        return;
      }
    }

    try {
      setRefundingId(tipId);

      const walletClient = await getWalletClient();
      if (!walletClient) throw new Error("Wallet not available.");

      const hash = await walletClient.writeContract({
        address: TIPJAR_ADDRESS,
        abi: TIPJAR_ABI,
        functionName: "refund",
        args: [BigInt(tipId)],
        account: address,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("The refund transaction reverted.");
      }

      setRefundTx(hash);
      setTips((prev) =>
        prev.map((t) =>
          t.tipId === tipId
            ? {
                ...t,
                phase: "refunded",
                displayAmount: t.amount,
                amount: 0n,
              }
            : t
        )
      );
    } catch (err: any) {
      console.error("Refund error:", err);
      setError(err?.shortMessage || err?.message || "The refund failed.");
    } finally {
      setRefundingId(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <h1 className="font-serif text-4xl text-[#F6F0E2]">Gifts you sent</h1>
        <p className="text-[#E7DCC8]/75 mt-3">
          Connect the wallet you send from to see them, and to take back anything
          still unclaimed after 7 days.
        </p>
        <button
          onClick={openConnectModal}
          className="btn-seal mt-6 max-w-xs"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="glass rounded-3xl p-6 sm:p-8">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-serif text-4xl">Gifts you sent</h1>
          <p className="text-sm text-doro-faint mt-2">
            {tips.length} from this wallet. You can take an unclaimed gift back after 7 days.
          </p>
        </div>
        <a href="/" className="text-sm text-doro-seal underline shrink-0">
          Send a gift
        </a>
      </div>

      {historyNote && <p className="mb-4 text-sm text-amber-200">{historyNote}</p>}
      {loadError && <p className="mb-4 text-sm text-red-300">{loadError}</p>}

      {refundTx && (
        <p className="mb-4 text-sm text-emerald-300">
          Refund confirmed.{" "}
          <a
            href={`https://testnet.monadscan.com/tx/${refundTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        </p>
      )}

      {error && (
        <p className="mb-4 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-16 text-sm text-doro-faint">Loading gifts…</p>
      ) : tips.length === 0 ? (
        <div className="py-12">
          <h2 className="font-serif text-2xl">Nothing sent from this wallet yet.</h2>
          <a href="/" className="inline-block mt-4 text-sm text-doro-seal underline">
            Send one
          </a>
        </div>
      ) : (
        <ul className="divide-y divide-white/10 border-y border-white/10">
          {tips.map((tip) => {
            const createdDate = new Date(Number(tip.createdAt) * 1000).toLocaleDateString(
              undefined,
              { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
            );
            const phase = tip.phase === "missing" ? "pending" : tip.phase;

            return (
              <li
                key={tip.tipId}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="font-serif text-xl tabular-nums">
                      {formatEther(tip.displayAmount)} MON
                    </span>
                    <span className="text-sm text-doro-faint">
                      {PHASE_LABEL[phase]}
                    </span>
                  </div>
                  <div className="text-sm text-doro-faint mt-1">
                    #{tip.tipId} · {createdDate}
                    {phase === "pending" && (
                      <> · {refundWindowLabel(Number(tip.expiresAt), nowSeconds)}</>
                    )}
                    {" · "}
                    <a href={`/claim/${tip.tipId}`} className="underline">
                      Claim page
                    </a>
                  </div>
                </div>

                {phase === "refundable" && (
                  <button
                    onClick={() => handleRefund(tip.tipId)}
                    disabled={refundingId === tip.tipId}
                    className="btn-seal-inline disabled:opacity-50"
                  >
                    {refundingId === tip.tipId ? "Confirming…" : "Take it back"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}
