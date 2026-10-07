"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "@/context/WalletContext";

export default function ConnectWalletModal() {
  const { isModalOpen, closeConnectModal, connectInjected, isConnecting, error } = useWallet();
  const [hasInjected, setHasInjected] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasInjected(!!(window as any).ethereum);
    }
  }, []);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeConnectModal();
    };
    if (isModalOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isModalOpen, closeConnectModal]);

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/55 transition-opacity"
        onClick={closeConnectModal}
      />

      {/* Modal Dialog */}
      <div className="gift-card relative w-full max-w-md text-doro-inktext p-6 z-10 settle">
        <div className="flex items-center justify-between pb-4 border-b border-doro-line">
          <div>
            <h3 className="font-serif text-2xl">Connect a wallet</h3>
            <p className="text-sm text-doro-muted mt-1">Monad Testnet</p>
          </div>
          <button
            onClick={closeConnectModal}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-doro-muted hover:text-doro-inktext"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 text-sm text-doro-danger" role="alert">
            {error}
          </div>
        )}

        {/* Wallet Options */}
        <div className="mt-5 space-y-3">
          {/* Option 1: Browser Wallet (MetaMask / Rabby / OKX / Phantom) */}
          <button
            onClick={connectInjected}
            disabled={isConnecting}
            className="w-full p-4 rounded-xl bg-white border border-doro-line hover:border-doro-seal text-left"
          >
            <div className="font-semibold text-sm">
              Browser wallet
              <span className="ml-2 text-xs font-normal text-doro-muted">
                {hasInjected ? "Detected" : "MetaMask, Rabby, or similar"}
              </span>
            </div>
            <p className="text-sm text-doro-muted mt-1">
              MetaMask, Rabby, or any wallet installed in this browser.
            </p>
          </button>
        </div>

        {/* Footer Info & Faucet Link */}
        <div className="mt-6 pt-4 border-t border-doro-line flex items-center justify-between text-sm text-doro-muted">
          <span>Chain 10143</span>
          <a
            href="https://faucet.monad.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-doro-seal underline"
          >
            Get testnet MON
          </a>
        </div>
      </div>
    </div>
  );
}
