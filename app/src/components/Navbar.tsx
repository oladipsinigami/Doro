"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/context/WalletContext";

export default function Navbar() {
  const pathname = usePathname();
  const {
    isConnected,
    address,
    balance,
    isCorrectNetwork,
    switchNetwork,
    disconnect,
    openConnectModal,
  } = useWallet();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrongNetwork = isConnected && !isCorrectNetwork;

  const formattedAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "";

  const linkClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm transition ${
      active ? "text-[#F6E7B4]" : "text-[#E7DCC8]/70 hover:text-[#F6F0E2]"
    }`;

  return (
    <nav className="w-full border-b border-white/10 bg-black/35 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          {/*
            A real link, not router.back(). Someone who opens a claim link from
            a DM has no previous in-app page to go back to, and a dead back
            button is worse than none.
          */}
          {pathname !== "/" && (
            <Link
              href="/"
              aria-label="Back to send"
              className="flex items-center gap-1 px-2 py-1.5 -ml-2 rounded-lg text-[#E7DCC8]/70 hover:text-[#F6F0E2] transition"
            >
              <span aria-hidden="true">←</span>
              <span className="text-sm">Back</span>
            </Link>
          )}

          <Link href="/" className="flex items-center gap-2">
            <span className="font-serif text-xl text-[#F6E7B4]">Doro</span>
            <span className="text-xs text-[#E8D7A2]/70 hidden sm:inline">δῶρο</span>
          </Link>

          <div className="flex items-center gap-1">
            <Link href="/" className={linkClass(pathname === "/")}>
              Send
            </Link>
            <Link href="/me" className={linkClass(pathname === "/me")}>
              Sent
            </Link>
            <Link href="/gifts" className={linkClass(pathname === "/gifts")}>
              Gifts
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${
              wrongNetwork
                ? "border-amber-700/60 text-amber-200"
                : "border-white/15 text-[#E7DCC8]/80"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                wrongNetwork ? "bg-amber-400" : "bg-emerald-500"
              }`}
            />
            <span>{wrongNetwork ? "Wrong network" : "Monad Testnet"}</span>
          </div>

          {isConnected ? (
            <div className="relative flex items-center gap-2">
              {wrongNetwork && (
                <button
                  onClick={switchNetwork}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-doro-ink text-xs font-semibold"
                >
                  Switch network
                </button>
              )}

              <div className="hidden md:block px-3 py-1.5 text-xs text-doro-faint tabular-nums">
                {balance} MON
              </div>

              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="px-3 py-1.5 rounded-full border border-white/15 text-xs font-mono text-[#F6F0E2]"
                aria-expanded={dropdownOpen}
                aria-haspopup="menu"
              >
                {formattedAddress}
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-doro-paper text-doro-inktext p-2 shadow-lg z-50"
                  onMouseLeave={() => setDropdownOpen(false)}
                  role="menu"
                >
                  <div className="px-3 py-2 border-b border-doro-line text-sm">
                    <div className="text-doro-muted text-xs">Balance</div>
                    <div className="tabular-nums">{balance} MON</div>
                  </div>
                  <a
                    href={`https://testnet.monadscan.com/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-3 py-2 rounded-lg text-sm hover:bg-white"
                  >
                    View on explorer
                  </a>
                  <button
                    onClick={() => {
                      disconnect();
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-doro-danger hover:bg-white"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={openConnectModal}
              id="navbar-connect-wallet-btn"
              className="btn-seal-inline"
            >
              Connect wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
