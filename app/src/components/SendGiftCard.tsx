"use client";

import React, { useEffect, useState } from "react";
import { parseEther, parseEventLogs } from "viem";
import { useWallet } from "@/context/WalletContext";
import { TIPJAR_ABI, TIPJAR_ADDRESS } from "@/lib/tipjar";
import { MASCOTS, type Mascot } from "@/lib/mascots";
import { normalizeSenderHandle } from "@/lib/gift-link";
import {
  buildPreview,
  fetchRecipientProfile,
  normalizePreviewHandle,
  type AvatarState,
  type RecipientProfile,
} from "@/lib/handle-preview";
import MascotSelector from "./MascotSelector";
import GeneratedGiftCard from "./GeneratedGiftCard";

/**
 * Debounced avatar + canonical-handle preview.
 *
 * A spelling check, not an ownership proof. The recipient still proves the
 * handle by signing in with X.
 */
function RecipientAvatarPreview({
  raw,
  onChange,
  disabled,
}: {
  raw: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [loadState, setLoadState] = useState<AvatarState>("idle");
  const [profile, setProfile] = useState<RecipientProfile | null>(null);
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(raw), 400);
    return () => clearTimeout(timer);
  }, [raw]);

  const handle = normalizePreviewHandle(debounced);

  useEffect(() => {
    if (handle === null) {
      setLoadState("idle");
      setProfile(null);
      return;
    }

    const controller = new AbortController();
    setLoadState("loading");
    setProfile(null);

    fetchRecipientProfile(handle, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result === null) {
          setLoadState("missing");
          return;
        }
        setProfile(result);
        setLoadState("found");
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        setLoadState("error");
      });

    return () => controller.abort();
  }, [handle]);

  const preview = buildPreview(debounced, loadState, profile);
  const showImage = preview.state === "found" && preview.avatarUrl;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 shrink-0 rounded-xl overflow-hidden bg-white border border-doro-line flex items-center justify-center"
          aria-hidden="true"
        >
          {showImage ? (
            <img
              src={preview.avatarUrl!}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : preview.state === "loading" ? (
            <div className="w-4 h-4 border-2 border-doro-line border-t-doro-seal rounded-full animate-spin" />
          ) : (
            <span className="text-doro-muted text-sm">@</span>
          )}
        </div>

        <div className="relative flex items-center flex-1 min-w-0">
          <span className="absolute left-3 text-doro-muted text-sm select-none">@</span>
          <input
            type="text"
            placeholder="name"
            value={raw}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-label="Recipient X handle"
            className="w-full pl-8 pr-3 py-3 rounded-xl bg-white border border-doro-line text-doro-inktext text-sm focus:outline-none focus:ring-2 focus:ring-doro-seal/30"
          />
        </div>
      </div>

      {preview.state !== "idle" && (
        <p className="text-sm text-doro-muted mt-2">
          {preview.state === "missing" ? (
            <>
              No X account found for{" "}
              <span className="font-mono">@{preview.handle}</span>. Check the spelling.
            </>
          ) : preview.state === "error" ? (
            "Couldn't reach X. Check the spelling yourself."
          ) : preview.state === "found" ? (
            <>
              {preview.displayName ? (
                <>
                  Sending to <span className="text-doro-inktext">{preview.displayName}</span>{" "}
                </>
              ) : null}
              <span className="font-mono">@{preview.handle}</span>. They still prove this
              handle by signing in with X.
            </>
          ) : (
            "Looking up that handle…"
          )}
        </p>
      )}
    </div>
  );
}

const fieldLabel = "block text-sm font-medium text-doro-inktext mb-2";
const field =
  "w-full px-3 py-3 rounded-xl bg-white border border-doro-line text-doro-inktext text-sm focus:outline-none focus:ring-2 focus:ring-doro-seal/30";

export default function SendGiftCard() {
  const {
    isConnected,
    address,
    balance,
    isCorrectNetwork,
    switchNetwork,
    openConnectModal,
    getWalletClient,
    publicClient,
    refreshBalance,
  } = useWallet();

  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("0.05");
  const [note, setNote] = useState("");
  const [senderHandle, setSenderHandle] = useState("");
  const [senderAvatarUrl, setSenderAvatarUrl] = useState<string | undefined>(undefined);

  // Resolve the self-reported sender's avatar on THIS browser, at send time, so
  // the claim link carries it and the recipient makes no third-party request.
  const senderNormalized = normalizeSenderHandle(senderHandle);
  useEffect(() => {
    if (senderNormalized === null) {
      setSenderAvatarUrl(undefined);
      return;
    }

    const controller = new AbortController();
    fetchRecipientProfile(senderNormalized, controller.signal)
      .then((profile) => {
        if (!controller.signal.aborted) setSenderAvatarUrl(profile?.avatarUrl ?? undefined);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSenderAvatarUrl(undefined);
      });

    return () => controller.abort();
  }, [senderNormalized]);
  const [selectedMascot, setSelectedMascot] = useState<Mascot>(MASCOTS[0]);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unparsedTx, setUnparsedTx] = useState<string | null>(null);

  const [createdGift, setCreatedGift] = useState<{
    tipId: number;
    txHash: string;
    handle: string;
    amount: string;
note: string;
      senderHandle?: string;
      senderAvatarUrl?: string;
      mascot: Mascot;
    } | null>(null);

  const quickAmounts = ["0.05", "0.1", "0.5", "1.0"];

  const handleMax = () => {
    const balNum = parseFloat(balance);
    if (!isNaN(balNum) && balNum > 0.01) {
      const safeMax = Math.max(0.01, balNum - 0.005).toFixed(4);
      setAmount(safeMax);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnparsedTx(null);
    setStatusMessage("");

    if (!isConnected) {
      openConnectModal();
      return;
    }

    if (!isCorrectNetwork) {
      try {
        await switchNetwork();
      } catch {
        setError("Switch your wallet to Monad Testnet (chain 10143).");
        return;
      }
    }

    const cleanHandle = handle.replace(/^@/, "").trim();
    if (!cleanHandle) {
      setError("Enter the recipient's X handle.");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0.01) {
      setError("The minimum gift is 0.01 MON.");
      return;
    }

    const currentBal = parseFloat(balance);
    if (!isNaN(currentBal) && numAmount > currentBal) {
      setError(`Not enough MON. This wallet has ${balance} MON.`);
      return;
    }

    try {
      setLoading(true);

      setStatusMessage("Locking the recipient's handle…");
      const hashRes = await fetch("/api/hash-handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: cleanHandle }),
      });

      const hashData = await hashRes.json();
      if (!hashRes.ok) {
        throw new Error(hashData.message || "Could not prepare that handle.");
      }

      const { handleHash } = hashData;

      setStatusMessage("Confirm the gift in your wallet.");
      const walletClient = await getWalletClient();
      if (!walletClient || !address) {
        throw new Error("Wallet unavailable. Connect again.");
      }

      const hash = await walletClient.writeContract({
        address: TIPJAR_ADDRESS,
        abi: TIPJAR_ABI,
        functionName: "createTip",
        args: [handleHash],
        value: parseEther(amount),
        account: address,
      });

      setStatusMessage("Waiting for Monad to confirm…");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        setUnparsedTx(hash);
        setError("The transaction reverted. Nothing was locked.");
        return;
      }

      const logs = parseEventLogs({
        abi: TIPJAR_ABI,
        logs: receipt.logs,
      });

      const createdLog = logs.find((l) => l.eventName === "TipCreated");
      const tipId =
        createdLog && createdLog.args.tipId !== undefined
          ? Number(createdLog.args.tipId)
          : undefined;

      // Never guess from nextTipId. Another gift can land between this
      // transaction and that read, and the share link would be wrong.
      if (tipId === undefined) {
        setUnparsedTx(hash);
        setError(
          "Monad confirmed the transaction, but the gift id was missing from the receipt. Use the explorer link before you share anything."
        );
        return;
      }

      refreshBalance();

      const resolvedSender = normalizeSenderHandle(senderHandle);
      setCreatedGift({
        tipId,
        txHash: hash,
        handle: cleanHandle,
        amount,
        note,
        senderHandle: resolvedSender ?? undefined,
        senderAvatarUrl: senderAvatarUrl ?? undefined,
        mascot: selectedMascot,
      });
    } catch (err: unknown) {
      console.error("Failed to send gift:", err);
      const message = err instanceof Error ? err.message : "The transaction failed.";
      setError(message);
    } finally {
      setLoading(false);
      setStatusMessage("");
    }
  };

  if (createdGift) {
    return (
      <GeneratedGiftCard
        tipId={createdGift.tipId}
        txHash={createdGift.txHash}
        handle={createdGift.handle}
        amount={createdGift.amount}
        note={createdGift.note}
        senderHandle={createdGift.senderHandle}
        senderAvatarUrl={createdGift.senderAvatarUrl}
        mascot={createdGift.mascot}
        onSendAnother={() => {
          setCreatedGift(null);
          setHandle("");
          setAmount("0.05");
          setNote("");
          setSenderHandle("");
          setSenderAvatarUrl(undefined);
        }}
      />
    );
  }

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="gift-card text-doro-inktext p-5 sm:p-8"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(200px,280px)_minmax(0,1fr)] items-start">
          <div className="mx-auto w-full max-w-[280px]">
            <img
              src={selectedMascot.image}
              alt={selectedMascot.name}
              className="w-full rounded-2xl shadow-[0_18px_40px_rgba(70,40,10,0.2)]"
            />
          </div>
          <div>
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-serif text-2xl">New gift</h2>
          {isConnected && (
            <div className="text-sm text-doro-muted tabular-nums">{balance} MON</div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <label className={fieldLabel}>Recipient</label>
            <RecipientAvatarPreview raw={handle} onChange={setHandle} disabled={loading} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Amount</label>
              {isConnected && (
                <button
                  type="button"
                  onClick={handleMax}
                  className="text-sm text-doro-seal"
                >
                  Use max
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                aria-label="Gift amount in MON"
                className={`${field} pr-14 font-serif text-2xl tabular-nums`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-doro-muted">
                MON
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(q)}
                  className={`py-1.5 rounded-lg text-sm tabular-nums ${
                    amount === q
                      ? "bg-[#4c2784] text-[#f8e7b0]"
                      : "bg-white/80 border border-[#e4d3b4] text-doro-inktext"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" htmlFor="gift-note">
                Note
              </label>
              <span className="text-xs text-doro-muted tabular-nums">{note.length}/140</span>
            </div>
            <textarea
              id="gift-note"
              rows={2}
              maxLength={140}
              placeholder="Optional. It travels with the claim link, not on-chain."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={loading}
              className={`${field} resize-none font-serif italic`}
            />
          </div>

          <MascotSelector
            selectedMascotId={selectedMascot.id}
            onSelect={(mascot) => setSelectedMascot(mascot)}
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" htmlFor="gift-sender-handle">
                From (optional)
              </label>
              <span className="text-xs text-doro-muted">Self-reported</span>
            </div>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-doro-muted text-sm select-none">@</span>
              <input
                id="gift-sender-handle"
                type="text"
                maxLength={16}
                placeholder="yourhandle"
                value={senderHandle}
                onChange={(e) => setSenderHandle(e.target.value)}
                disabled={loading}
                className={`${field} pl-7`}
              />
            </div>
            <p className="mt-1.5 text-xs text-doro-muted">
              Shown on the gift card. We can&apos;t verify it against your wallet, so the
              recipient sees it as unconfirmed.
            </p>
            {senderAvatarUrl && (
              <div className="mt-2 flex items-center gap-2">
                <img
                  src={senderAvatarUrl}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover border border-doro-line"
                  referrerPolicy="no-referrer"
                />
                <span className="text-xs text-doro-muted">
                  Your picture travels with the claim link.
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="text-sm text-doro-danger" role="alert">
              <p>{error}</p>
              {unparsedTx && (
                <a
                  href={`https://testnet.monadscan.com/tx/${unparsedTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  View transaction
                </a>
              )}
            </div>
          )}

          {statusMessage && (
            <p className="text-sm text-doro-muted" role="status">
              {statusMessage}
            </p>
          )}

          {!isConnected ? (
            <button
              type="button"
              onClick={openConnectModal}
              id="form-connect-wallet-btn"
              className="btn-seal"
            >
              Connect wallet
            </button>
          ) : !isCorrectNetwork ? (
            <button
              type="button"
              onClick={switchNetwork}
              className="btn-seal bg-amber-500 text-doro-ink"
            >
              Switch to Monad Testnet
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              id="submit-gift-btn"
              className="btn-seal disabled:opacity-50"
            >
              {loading ? "Sending…" : `Send ${amount} MON`}
            </button>
          )}
        </div>

        <p className="mt-5 text-sm text-doro-muted">
          Unclaimed gifts can be taken back by you after 7 days.{" "}
          <a href="/me" className="underline text-doro-inktext">
            See gifts you sent
          </a>
        </p>
          </div>
        </div>
      </form>
    </div>
  );
}
