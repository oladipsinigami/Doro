"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

export default function Navbar() {
  const pathname = usePathname();
  const { ready, authenticated, user, login, logout } = usePrivy();

  const twitterUsername = user?.twitter?.username;
  const embeddedWallet = user?.linkedAccounts?.find(
    (a) => a.type === "wallet" && a.walletClientType === "privy"
  ) as any;

  return (
    <nav className="w-full border-b border-monad-border/60 bg-monad-deep/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-monad-purple to-monad-cyan flex items-center justify-center font-black text-white text-lg shadow-lg group-hover:scale-105 transition">
              🏺
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xl tracking-tight text-white flex items-center gap-1.5">
                TipJar
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-monad-purple/20 text-monad-purple border border-monad-purple/40">
                  Monad
                </span>
              </span>
            </div>
          </Link>

          <div className="hidden sm:flex items-center gap-1">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                pathname === "/"
                  ? "bg-monad-purple/20 text-white font-semibold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Send Tip
            </Link>
            <Link
              href="/me"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                pathname === "/me"
                  ? "bg-monad-purple/20 text-white font-semibold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              My Tips & Refunds
            </Link>
          </div>
        </div>

        {/* Network & Auth */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Monad Testnet (10143)</span>
          </div>

          {ready && (
            <div>
              {authenticated ? (
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 rounded-xl bg-monad-card border border-monad-border text-xs flex items-center gap-2">
                    {twitterUsername ? (
                      <span className="font-bold text-monad-cyan">@{twitterUsername}</span>
                    ) : (
                      <span className="text-zinc-400">Authenticated</span>
                    )}
                    {embeddedWallet?.address && (
                      <span className="font-mono text-zinc-400 hidden lg:inline">
                        ({embeddedWallet.address.slice(0, 6)}...{embeddedWallet.address.slice(-4)})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={logout}
                    className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-400 hover:text-white transition border border-zinc-800"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={login}
                  className="px-4 py-2 rounded-xl bg-monad-purple hover:bg-monad-purple/90 text-white text-sm font-semibold transition shadow-md hover:shadow-monad-purple/25"
                >
                  Connect Wallet / X
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
