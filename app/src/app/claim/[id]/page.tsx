"use client";

import React, { Suspense, useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { getIdentityToken, usePrivy, useLogout } from "@privy-io/react-auth";
import { createPublicClient, formatEther, http } from "viem";
import { monadTestnet } from "@/lib/chain";
import { TIPJAR_ABI, TIPJAR_ADDRESS } from "@/lib/tipjar";
import { findTwitterUsername } from "@/lib/privy-user";
import { buildClaimAuthMessage } from "@/lib/claim-auth";
import { useWallet } from "@/context/WalletContext";
import { readClaimCard } from "@/lib/gift-link";
import { expiryLabel } from "@/lib/my-gifts";
import { classifyGift } from "@/lib/gift-status";
import { getMascotById } from "@/lib/mascots";

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz"),
});

function ClaimTipPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const tipId = resolvedParams.id;
  const searchParams = useSearchParams();
  const card = readClaimCard(searchParams);
  const mascot = getMascotById(card.mascotId);

  const { ready, authenticated, user, login, getAccessToken } = usePrivy();
  const { logout } = useLogout();

  const [loggingOut, setLoggingOut] = useState(false);

  const {
    isConnected: externalConnected,
    address: externalAddress,
    isCorrectNetwork: externalCorrectNetwork,
    switchNetwork: switchExternalNetwork,
    openConnectModal: openExternalConnect,
    getWalletClient: getExternalClient,
  } = useWallet();

  const [tipData, setTipData] = useState<any>(null);
  const [loadingTip, setLoadingTip] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccessTx, setClaimSuccessTx] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // "Do you have a gift waiting?" Senders cannot notify an offline recipient,
  // so this is how someone finds a gift that arrived without a claim link.
  const [myGifts, setMyGifts] = useState<
    { tipId: number; amount: string; expiresAt: number; sender: string; claimPath: string }[] | null
  >(null);
  const [myGiftsError, setMyGiftsError] = useState<string | null>(null);
  const [myGiftsTruncated, setMyGiftsTruncated] = useState(false);
  const [checkingMine, setCheckingMine] = useState(false);

  // Ownership of *this* gift. Null until checked. Once we know the gift is not
  // addressed to this login, we route them to whatever IS theirs.
  const [ownership, setOwnership] = useState<"unknown" | "mine" | "theirs">("unknown");
  const [redirecting, setRedirecting] = useState(false);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  const twitterUsername = findTwitterUsername(user as any);

  // Once signed in with a linked handle, settle whether this gift is theirs
  // before offering a claim that would fail.
  useEffect(() => {
    if (!authenticated || !twitterUsername || ownership !== "unknown") return;
    if (!/^\d+$/.test(tipId)) return;
    if (redirecting) return;

    handleCheckOwnership();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, twitterUsername, tipId]);

  const handleFindMyGifts = async () => {
    setMyGiftsError(null);
    setMyGiftsTruncated(false);

    try {
      setCheckingMine(true);

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

      setMyGifts(data.gifts ?? []);
      setMyGiftsTruncated(Boolean(data.truncated));
    } catch (err: any) {
      console.error("my-gifts lookup failed:", err);
      setMyGiftsError(err?.message || "Couldn't look up your gifts.");
    } finally {
      setCheckingMine(false);
    }
  };

  /**
   * Ask the server whether this gift is addressed to the signed-in handle, then
   * route to the right gift. The browser cannot answer this itself: it would
   * need the server-side salt to hash the handle.
   */
  const handleCheckOwnership = async () => {
    setMyGiftsError(null);
    setClaimError(null);

    try {
      const accessToken = await getAccessToken();
      const identityToken = await getIdentityToken();

      const res = await fetch("/api/gift-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipId: Number(tipId),
          ...(identityToken ? { identityToken } : {}),
          accessToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        // Unknown ownership: leave the claim button alone rather than guessing.
        setMyGiftsError(data.message || "Couldn't check that gift.");
        return;
      }

      if (data.mine) {
        setOwnership("mine");
        return;
      }

      setOwnership("theirs");
      setRedirecting(true);

      // Route them to whatever IS theirs, or to a clear dead end.
      const mineRes = await fetch("/api/my-gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(identityToken ? { identityToken } : {}),
          accessToken,
        }),
      });

      if (mineRes.ok) {
        const mineData = await mineRes.json();
        const gifts = mineData.gifts ?? [];
        setMyGifts(gifts);
        setMyGiftsTruncated(Boolean(mineData.truncated));
        setRedirectTo(gifts.length > 0 ? gifts[0].claimPath : null);
      }
    } catch (err: any) {
      console.error("ownership check failed:", err);
      setMyGiftsError(err?.message || "Couldn't check that gift.");
    } finally {
      setCheckingMine(false);
    }
  };

  useEffect(() => {
    async function loadTip() {
      if (!/^\d+$/.test(tipId)) {
        setTipData(null);
        setLoadError(null);
        setLoadingTip(false);
        return;
      }

      try {
        setLoadingTip(true);
        setLoadError(null);

        const tip = (await publicClient.readContract({
          address: TIPJAR_ADDRESS,
          abi: TIPJAR_ABI,
          functionName: "getTip",
          args: [BigInt(tipId)],
        })) as any;

        setTipData(tip);
      } catch (err) {
        console.error("Failed to load tip:", err);
        setTipData(null);
        setLoadError("Monad didn't answer. This gift may still exist.");
      } finally {
        setLoadingTip(false);
      }
    }

    if (tipId !== undefined) {
      loadTip();
    }
  }, [tipId, loadAttempt]);

  useEffect(() => {
    if (!externalAddress) {
      setWalletBalance(null);
      return;
    }

    let cancelled = false;
    publicClient
      .getBalance({ address: externalAddress })
      .then((bal) => {
        if (!cancelled) setWalletBalance(bal);
      })
      .catch(() => {
        if (!cancelled) setWalletBalance(null);
      });

    return () => {
      cancelled = true;
    };
  }, [externalAddress]);

  async function authFields() {
    const accessToken = await getAccessToken();
    const identityToken = await getIdentityToken();
    return {
      tipId: Number(tipId),
      accessToken,
      ...(identityToken ? { identityToken } : {}),
    };
  }

  const handleLogout = async () => {
    setClaimError(null);
    setStatusMessage("");
    try {
      setLoggingOut(true);
      await logout();
    } catch (err: any) {
      console.error("Logout failed:", err);
      setClaimError("Couldn't sign out. Try again.");
    } finally {
      setLoggingOut(false);
    }
  };

  async function waitForSuccess(hash: `0x${string}`) {
    setStatusMessage("Waiting for Monad to confirm…");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error("The transaction was sent and then reverted.");
    }
  }

  const handleExternalClaim = async () => {
    setClaimError(null);
    setStatusMessage("");

    if (!authenticated) {
      login();
      return;
    }

    if (!twitterUsername) {
      setClaimError("Sign in with X first so we can check the handle.");
      return;
    }

    if (!externalConnected || !externalAddress) {
      openExternalConnect();
      return;
    }

    try {
      setClaiming(true);

      if (!externalCorrectNetwork) {
        setStatusMessage("Switching to Monad Testnet…");
        await switchExternalNetwork();
      }

      const walletClient = await getExternalClient();
      if (!walletClient) throw new Error("Wallet not available.");

      setStatusMessage("Sign the ownership check in your wallet.");
      const challenge = buildClaimAuthMessage({
        recipient: externalAddress,
        tipId: BigInt(tipId),
        chainId: monadTestnet.id,
      });
      const ownershipSignature = await walletClient.signMessage({
        account: externalAddress,
        message: challenge,
      });

      setStatusMessage("Checking your X account…");
      const res = await fetch("/api/claim/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(await authFields()),
          recipient: externalAddress,
          recipientSignature: ownershipSignature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Claim rejected (${data.error || res.status})`);
      }

      const { recipient, deadline, signature } = data;

      setStatusMessage("Confirm the claim in your wallet.");
      const hash = await walletClient.writeContract({
        address: TIPJAR_ADDRESS,
        abi: TIPJAR_ABI,
        functionName: "claim",
        args: [BigInt(tipId), recipient, BigInt(deadline), signature],
        account: recipient,
      });

      await waitForSuccess(hash);
      setClaimSuccessTx(hash);
      setStatusMessage("");
      setClaiming(false);
    } catch (err: any) {
      console.error("External wallet claim error:", err);
      setClaimError(err?.shortMessage || err?.message || "Couldn't claim this gift.");
      setClaiming(false);
      setStatusMessage("");
    }
  };

  if (!ready && loadingTip) {
    return <p className="py-24 text-center text-sm text-doro-faint">Loading gift…</p>;
  }

  if (ownership === "theirs") {
    return (
      <div className="w-full max-w-2xl mx-auto py-12 px-4">
        <article className="gift-card text-doro-inktext p-6 sm:p-8 settle text-center">
          <h1 className="font-serif text-3xl">Not your gift</h1>
          <p className="text-sm text-doro-muted mt-2">
            Gift #{tipId} is addressed to a different X account. You are signed in as{" "}
            <span className="font-mono">@{twitterUsername}</span>.
          </p>

          {redirecting ? (
            <p className="text-sm text-doro-muted mt-6">Looking for your gifts…</p>
          ) : redirectTo ? (
            <div className="mt-6">
              <p className="text-sm">
                You have a gift waiting. Opening it…
              </p>
              <a href={redirectTo} className="btn-seal mt-3 inline-block">
                Claim gift #{redirectTo.split("/").pop()}
              </a>
            </div>
          ) : myGifts && myGifts.length === 0 ? (
            <div className="mt-6">
              <p className="text-sm">
                No gifts are waiting on{" "}
                <span className="font-mono">@{twitterUsername}</span>.
              </p>
              <p className="text-xs text-doro-muted mt-2">
                A sender cannot reach you without sending a link, so nothing else is pending.
              </p>
              <a href="/" className="inline-block mt-4 text-sm underline">
                Send a gift instead
              </a>
            </div>
          ) : (
            <p className="text-sm text-doro-muted mt-6">
              Checking whether you have a gift waiting…
            </p>
          )}

          {myGiftsError && (
            <p className="mt-4 text-sm text-doro-danger" role="alert">
              {myGiftsError}
            </p>
          )}

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="mt-6 text-xs text-doro-muted underline hover:text-doro-inktext disabled:opacity-50"
          >
            {loggingOut ? "Signing out…" : "Sign out and try another X account"}
          </button>
        </article>
      </div>
    );
  }

  if (loadingTip) {
    return (
      <p className="py-24 text-center text-sm text-doro-faint">Loading gift #{tipId}…</p>
    );
  }

  const phase = tipData
    ? classifyGift(tipData, Math.floor(Date.now() / 1000))
    : "missing";

  const destinationCopy = "The MON is in the wallet you just confirmed.";

  return (
    <div className="w-full max-w-4xl mx-auto py-12 px-4">
      <article className="gift-card text-doro-inktext p-5 sm:p-8 settle">
        {claimSuccessTx ? (
          <div className="text-center">
            <img src={mascot.image} alt={mascot.name} className="mx-auto w-48 rounded-2xl" />
            <h1 className="font-serif text-3xl mt-2">Claimed.</h1>
            <p className="text-sm text-doro-muted mt-2">{destinationCopy}</p>
            <a
              href={`https://testnet.monadscan.com/tx/${claimSuccessTx}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-4 text-sm text-doro-seal underline font-mono break-all"
            >
              {claimSuccessTx}
            </a>
            <div>
              <a href="/" className="inline-block mt-6 text-sm underline">
                Send a gift back
              </a>
            </div>
          </div>
        ) : loadError ? (
          <div className="text-center py-6">
            <h1 className="font-serif text-3xl">Couldn&apos;t load this gift</h1>
            <p className="text-sm text-doro-muted mt-2">{loadError}</p>
            <button
              onClick={() => setLoadAttempt((n) => n + 1)}
              className="mt-4 text-sm text-doro-seal underline"
            >
              Try again
            </button>
          </div>
        ) : phase === "missing" ? (
          <div className="text-center py-6">
            <h1 className="font-serif text-3xl">No gift here</h1>
            <p className="text-sm text-doro-muted mt-2">
              Gift #{tipId} is not on this contract.
            </p>
            <a href="/" className="inline-block mt-4 text-sm underline">
              Back home
            </a>
          </div>
        ) : phase === "refunded" ? (
          <div className="text-center py-6">
            <h1 className="font-serif text-3xl">Taken back</h1>
            <p className="text-sm text-doro-muted mt-2">
              The sender refunded this gift after the 7 days.
            </p>
          </div>
        ) : phase === "claimed" ? (
          <div className="text-center py-6">
            <h1 className="font-serif text-3xl">Already claimed</h1>
            <p className="text-sm text-doro-muted mt-2">Claimed by</p>
            <code className="text-xs font-mono">{tipData.claimedBy}</code>
          </div>
        ) : phase === "refundable" ? (
          <div className="text-center py-6">
            <h1 className="font-serif text-3xl">This gift expired</h1>
            <p className="text-sm text-doro-muted mt-2">
              The 7 days are up. The sender can take the MON back.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-center">
            <img src={mascot.image} alt={mascot.name} className="w-full rounded-2xl" />
            <div>
            <div>
                <div className="text-sm text-doro-muted">{mascot.name}</div>
                {card.senderHandle && (
                  <div className="mt-2 flex items-center gap-2.5">
                    {card.senderAvatarUrl && (
                      <img
                        src={card.senderAvatarUrl}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover border border-doro-line shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div>
                      <div className="text-sm">
                        <span className="text-doro-muted">From </span>
                        <span className="font-mono">@{card.senderHandle}</span>
                      </div>
                      <div className="text-xs text-doro-muted">
                        Self-reported, not verified against their wallet
                      </div>
                    </div>
                  </div>
                )}
                <div className="font-serif text-5xl tabular-nums leading-none">
                  {formatEther(tipData.amount)}
                  <span className="text-2xl ml-2">MON</span>
                </div>
            </div>

            <p className="font-serif italic text-lg mt-6">
              {card.note ? `“${card.note}”` : "No note was attached to this link."}
            </p>
            <p className="text-xs text-doro-muted mt-3">
              The note and courier travel with this link. The MON is locked in the contract.
              Sender {tipData.sender.slice(0, 6)}…{tipData.sender.slice(-4)}.
            </p>

            {authenticated && (
              <dl className="mt-6 text-sm space-y-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-doro-muted">X</dt>
                  <dd>@{twitterUsername || "Not linked"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-doro-muted">Wallet</dt>
                  <dd className="font-mono text-xs">
                    {externalAddress
                      ? `${externalAddress.slice(0, 6)}…${externalAddress.slice(-4)}`
                      : "Not connected"}
                  </dd>
                </div>
                {externalAddress && walletBalance !== null && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-doro-muted">Gas</dt>
                    <dd className="tabular-nums">{formatEther(walletBalance)} MON</dd>
                  </div>
                )}
                <div className="pt-3 mt-3 border-t border-doro-line flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button
                    onClick={handleFindMyGifts}
                    disabled={checkingMine}
                    className="text-xs text-doro-muted underline hover:text-doro-inktext disabled:opacity-50"
                  >
                    {checkingMine ? "Checking…" : "Check for other gifts on my handle"}
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="text-xs text-doro-muted underline hover:text-doro-inktext disabled:opacity-50"
                  >
                    {loggingOut ? "Signing out…" : "Sign out and use a different X account"}
                  </button>
                </div>
              </dl>
            )}

            {authenticated && externalAddress && walletBalance !== null && walletBalance < 5000000000000000n && (
              <div className="mt-4 p-3 rounded-xl bg-amber-50 text-sm text-doro-warn">
                <p>This wallet needs a little MON for gas, about 0.001.</p>
                <a
                  href="https://faucet.monad.xyz"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Open the faucet
                </a>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-xs truncate">{externalAddress}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(externalAddress);
                      setCopiedAddress(true);
                      setTimeout(() => setCopiedAddress(false), 2000);
                    }}
                    className="text-xs underline shrink-0"
                  >
                    {copiedAddress ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            {authenticated && externalConnected && !externalCorrectNetwork && (
              <p className="mt-4 text-sm text-doro-muted">
                This wallet is on another network. Claiming switches it to Monad Testnet.
              </p>
            )}

            {claimError && (
              <p className="mt-4 text-sm text-doro-danger" role="alert">
                {claimError}
              </p>
            )}
            {myGiftsError && (
              <p className="mt-2 text-sm text-doro-danger" role="alert">
                {myGiftsError}
              </p>
            )}

            {myGifts && myGifts.length > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-doro-wash border border-doro-line">
                <p className="text-sm font-medium">
                  You have {myGifts.length === 1 ? "a gift" : `${myGifts.length} gifts`} waiting
                  on @{twitterUsername}.
                </p>
                <ul className="mt-3 space-y-2">
                  {myGifts.map((g) => (
                    <li key={g.tipId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="tabular-nums">
                        {formatEther(BigInt(g.amount))} MON
                        <span className="text-doro-muted text-xs ml-2">
                          {expiryLabel(g.expiresAt, Math.floor(Date.now() / 1000))}
                        </span>
                      </span>
                      <a href={g.claimPath} className="text-doro-seal underline shrink-0">
                        Claim gift #{g.tipId}
                      </a>
                    </li>
                  ))}
                </ul>
                {myGiftsTruncated && (
                  <p className="mt-3 text-xs text-doro-muted">
                    Older gifts were not checked. This is an older contract with more gifts than
                    one scan covers.
                  </p>
                )}
              </div>
            )}

            {myGifts && myGifts.length === 0 && (
              <p className="mt-4 text-sm text-doro-muted">
                No gifts are waiting on @{twitterUsername}.
              </p>
            )}
            {statusMessage && (
              <p className="mt-4 text-sm text-doro-muted" role="status">
                {statusMessage}
              </p>
            )}

            <p className="text-xs text-doro-muted mt-6">
              X proves the handle. Your own wallet receives the MON and pays the gas.
            </p>

            {!authenticated ? (
              <button
                onClick={login}
                className="btn-seal mt-3"
              >
                Sign in with X
              </button>
            ) : !externalConnected || !externalAddress ? (
              <button
                onClick={openExternalConnect}
                disabled={claiming}
                className="btn-seal mt-3 disabled:opacity-50"
              >
                Connect a wallet to claim
              </button>
            ) : (
              <button
                onClick={handleExternalClaim}
                disabled={claiming || !twitterUsername}
                className="btn-seal mt-3 disabled:opacity-50"
              >
                {claiming
                  ? "Claiming…"
                  : `Claim ${formatEther(tipData.amount)} MON`}
              </button>
            )}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="py-24 text-center text-sm text-doro-faint">Loading gift…</p>}>
      <ClaimTipPage params={params} />
    </Suspense>
  );
}
