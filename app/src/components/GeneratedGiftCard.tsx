"use client";

import React, { useState } from "react";
import { type Mascot } from "@/lib/mascots";
import { buildClaimPath } from "@/lib/gift-link";


interface GeneratedGiftCardProps {
  tipId: number;
  txHash: string;
  handle: string;
  amount: string;
  note: string;
  /** Optional, self-reported sender handle shown on the recipient's card. */
  senderHandle?: string;
  /** Resolved from senderHandle on the sender's side. */
  senderAvatarUrl?: string;
  mascot: Mascot;
  onSendAnother: () => void;
}

export default function GeneratedGiftCard({
  tipId,
  txHash,
  handle,
  amount,
  note,
  senderHandle,
  senderAvatarUrl,
  mascot,
  onSendAnother,
}: GeneratedGiftCardProps) {
  const [copied, setCopied] = useState(false);

  const cleanHandle = handle.replace(/^@/, "").trim();
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;
  const built = buildClaimPath({
    tipId,
    mascotId: mascot.id,
    note,
    senderHandle,
    senderAvatarUrl,
    origin,
  });
  const claimUrl = built.ok ? built.url : "";

  const explorerUrl = `https://testnet.monadscan.com/tx/${txHash}`;
  const tweetText = `I sent @${cleanHandle} ${amount} MON on @monad_xyz. Claim it here: ${claimUrl}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  const handleCopy = () => {
    if (!claimUrl) return;
    navigator.clipboard.writeText(claimUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="w-full settle">
      <p className="text-sm text-doro-faint mb-4">Locked on Monad Testnet.</p>

      <article className="gift-card text-doro-inktext p-5 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.1fr)] items-center">
          <img
            src={mascot.image}
            alt={mascot.name}
            className="w-full rounded-2xl"
          />
          <div>
        <div className="flex items-center justify-between">
          <span className="font-serif text-lg">Doro #{tipId}</span>
          <span className="text-sm text-doro-muted">{mascot.name}</span>
        </div>

        <div className="mt-6">
          <div className="text-sm text-doro-muted">For @{cleanHandle}</div>
          <div className="font-serif text-5xl tabular-nums leading-none mt-1">
            {amount}
            <span className="text-2xl ml-2">MON</span>
          </div>
        </div>

        <p className="font-serif italic text-lg mt-6">
          {note.trim() ? `“${note.trim()}”` : "No note."}
        </p>
        <p className="text-sm text-doro-muted mt-3">{mascot.quoteTemplate(amount, cleanHandle)}</p>

        <p className="text-xs text-doro-muted mt-6">
          The note and courier travel with this link. The MON is locked in the contract.
        </p>

        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-sm text-doro-seal underline font-mono"
        >
          {txHash.slice(0, 10)}…{txHash.slice(-6)}
        </a>
          </div>
        </div>
      </article>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="py-3 rounded-full bg-white/90 text-doro-ink text-sm font-semibold text-center"
        >
          Share on X
        </a>
        <button
          onClick={handleCopy}
          className="btn-seal"
        >
          {copied ? "Link copied" : "Copy claim link"}
        </button>
      </div>

      <button
        onClick={onSendAnother}
        className="w-full mt-3 py-2 text-sm text-doro-faint hover:text-[#F3EEE6]"
      >
        Send another
      </button>
    </div>
  );
}
