"use client";

import Link from "next/link";
import { getIdentityToken, usePrivy, useLogout } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";

import { findTwitterUsername } from "@/lib/privy-user";
import { expiryLabel } from "@/lib/my-gifts";
import { formatMon, shortAddress } from "@/lib/format";

type GiftRow = {
  tipId: number;
  amount: string;
  expiresAt: number;
  sender: string;
  claimPath: string;
};

/**
 * The recipient's inbox.
 *
 * X login is the only gate. No wallet is connected here on purpose: connecting
 * is something the recipient does on the claim page, once they have picked a
 * gift, because that is when we know which wallet should receive the funds.
 *
 * The handle hash is computed server-side in /api/my-gifts, so this page never
 * holds the salt and cannot work out anyone else's gifts. It only ever learns
 * the tips addressed to the caller.
 */
export default function GiftsPage() {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const { logout } = useLogout();

  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [scanned, setScanned] = useState(0);

  const twitterUsername = findTwitterUsername(user as any);

  const loadGifts = useCallback(async () => {
    setLoadError(null);
    setLoading(true);

    try {
      const accessToken = await getAccessToken();
      const identityToken = await getIdentityToken();

      const res = await fetch("/api/my-gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(identityToken ? { identityToken } : {}),
          accessToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Lookup failed (${data.error || res.status})`);
      }

      setGifts(data.gifts ?? []);
      setTruncated(Boolean(data.truncated));
      setScanned(Number(data.scanned) || 0);
    } catch (err: any) {
      console.error("my-gifts lookup failed:", err);
      setLoadError(err?.message || "Couldn't look up your gifts.");
      setGifts([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (!authenticated || !twitterUsername) return;
    loadGifts();
  }, [authenticated, twitterUsername, loadGifts]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Still restoring the Privy session. Rendering the signed-out view here would
  // flash "log in" at someone who is already signed in.
  if (!ready) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <p className="text-[#E7DCC8]/70">Checking your session…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <h1 className="font-serif text-4xl text-[#F6F0E2]">Your gifts</h1>
        <p className="text-[#E7DCC8]/75 mt-3">
          Log in with X to see the gifts addressed to you. You do not need a
          wallet until you claim one.
        </p>
        <button onClick={login} className="btn-seal mt-6 max-w-xs">
          Log in with X
        </button>
      </div>
    );
  }

  if (!twitterUsername) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <h1 className="font-serif text-4xl text-[#F6F0E2]">No X handle found</h1>
        <p className="text-[#E7DCC8]/75 mt-3">
          Your account has no linked X handle, so there is nothing to look gifts
          up against.
        </p>
        <button onClick={handleLogout} className="btn-seal mt-6 max-w-xs">
          Sign out
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
            <h1 className="font-serif text-4xl">Your gifts</h1>
            <p className="text-sm text-doro-faint mt-2">
              {gifts.length === 0
                ? `Nothing waiting for @${twitterUsername}.`
                : `${gifts.length} waiting for @${twitterUsername}.`}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={loadGifts}
              disabled={loading}
              className="text-sm text-doro-seal underline disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-doro-faint underline"
            >
              Sign out
            </button>
          </div>
        </div>

        {loadError && <p className="mb-4 text-sm text-red-300">{loadError}</p>}

        {truncated && (
          <p className="mb-4 text-sm text-amber-200">
            Only the most recent gifts were checked{scanned ? ` (${scanned})` : ""}.
            Older ones may not appear.
          </p>
        )}

        {!loading && gifts.length === 0 && !loadError && (
          <div className="py-10 text-center">
            <p className="text-[#E7DCC8]/75">No unclaimed gifts right now.</p>
            <Link href="/" className="inline-block mt-4 text-sm text-doro-seal underline">
              Send someone a gift
            </Link>
          </div>
        )}

        <ul className="space-y-3">
          {gifts.map((gift) => (
            <li key={gift.tipId}>
              <Link
                href={gift.claimPath}
                className="block p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-doro-seal transition"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-serif text-2xl text-[#F6E7B4]">
                      {formatMon(gift.amount)}
                    </p>
                    <p className="text-sm text-doro-faint mt-1">
                      From {shortAddress(gift.sender)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[#E7DCC8]/85">
                      {expiryLabel(gift.expiresAt, nowSeconds)}
                    </p>
                    <p className="text-sm text-doro-seal mt-1">Tap to claim</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}