"use client";

import React from "react";
import SendGiftCard from "@/components/SendGiftCard";

export default function HomePage() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex flex-col justify-between">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-16 relative z-10 w-full">
        <div className="mb-8 max-w-xl">
          <p className="text-[11px] tracking-[0.28em] uppercase text-[#E8D7A2]/80">
            A gift across the dark
          </p>
          <h1 className="font-serif text-4xl sm:text-6xl text-[#F8F1E4] tracking-tight leading-[1.12] mt-3">
            Send MON to someone on X.
          </h1>
          <p className="text-base text-[#E7DCC8]/80 mt-4 leading-relaxed max-w-md">
            They sign in with X, then claim with their own wallet.
            If they don&apos;t within 7 days, you can take it back.
          </p>
        </div>

        <SendGiftCard />
      </main>

      <footer className="relative z-10 w-full border-t border-white/10 py-6 text-sm text-[#E7DCC8]/70">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <span>Doro on Monad Testnet</span>
          <div className="flex items-center gap-4">
            <a
              href="https://testnet.monadscan.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#F8F1E4]"
            >
              Explorer
            </a>
            <a
              href="https://faucet.monad.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#F8F1E4]"
            >
              Faucet
            </a>
            <a href="/me" className="hover:text-[#F8F1E4]">
              Sent gifts
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
