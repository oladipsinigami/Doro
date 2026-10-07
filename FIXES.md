# Fixes — 7 October 2026

These are the product bugs and the interface changes made after the review of Doro. The live TipJar at `0xa7a9ACAc332C398B61f7459215Fd4f5522686b88` was not redeployed. The app still decodes that contract's ABI, including `uint40` timestamps and a refund that leaves `claimedBy` at the zero address.

## Claim and send behavior

**The claim page now sends an identity token.** `app/src/app/claim/[id]/page.tsx` calls `getIdentityToken()` from `@privy-io/react-auth` when the user claims, and it includes `identityToken` only when Privy returns a string. `extractClaimRequest` rejects a non-string token, including `null`, so the field is omitted rather than sent as `null`. The server still falls back to a lookup with `PRIVY_APP_SECRET` when the token is absent.

**A voucher slot is reserved only when a signature is about to be produced.** Both `POST /api/claim` and `POST /api/claim/wallet` share `app/src/lib/voucher-limit.ts`. Handle mismatches, missing wallets, unknown gifts, and expired gifts return before `reserve()`. If `signTipClaimVoucher` throws, `release()` returns the slot, and only for the same rate-limit window. A failed attempt no longer burns the minute. The identity limiter still counts attempts before Privy, on purpose, as a flood throttle.

The limiter is still one map inside one Node process. A second server process has its own map. That is SD-06, and it stays open. `SECURITY-DEBT.md` records the 7 October update.

**The courier and the note travel on the claim link.** `buildClaimPath` writes `m` (mascot id) and `n` (note, 140 characters). The claim page reads them with `readClaimCard`. An unknown courier falls back to Doro Angel. A missing gift id is a hard failure. The send form no longer guesses `nextTipId - 1`. If the receipt has no `TipCreated` log, the page shows the explorer link and does not offer a claim URL.

**History reads the sender's logs.** `/me` asks for `TipCreated` and `TipRefunded` from deploy block `68595309` when the configured address is the known deployment, and from block 0 otherwise. Refunded gifts are not labeled claimed: a refund sets `claimed` and zeroes `amount` while leaving `claimedBy` at the zero address, and `classifyGift` uses that shape. The amount shown for a refund comes from the `TipRefunded` event, because `getTip` has already zeroed it. If the log query fails, the page falls back to the latest 200 ids and says so. "Refund confirmed" is shown only after the receipt status is success.

**A claim is confirmed only after the receipt.** Both the embedded-wallet path and the external-wallet path call `waitForTransactionReceipt` and treat a reverted receipt as a failure. The success line depends on which path was used: the Privy wallet, or the wallet the user just confirmed. An RPC failure on the claim page is a load error with Try again, separate from "No gift here".

**Faucet links point at the faucet.** The homepage footer, the connect dialog, and the claim-page gas banner use `https://faucet.monad.xyz`. `https://testnet.monad.xyz` is the developer hub.

## Interface

The page ground is `#141210`. The gift is a paper card (`#F3EEE6`, ink `#1C1915`). Monad purple `#6E56CF` is the seal and the one primary action. Cyan and pink are gone from the chrome. Schibsted Grotesk is the interface face. Fraunces is used for the amount, the note, and the titles. Amounts use tabular figures.

The send screen is one job: recipient, amount, note, courier, send. The hackathon pill, the throughput metrics, and the courier brochure are gone. Courier copy that said "Celestial" and "10,000 TPS" is gone from `app/src/lib/mascots.ts`. The picker is four portraits. The selected one has a 2px seal ring. Portrait back-glows were removed, and the angel's wings were darkened so they read on the paper.

The claim page is the same card. It says the note and the courier travel with the link, and that the MON is locked in the contract. Claiming to a wallet the user already has sits in a closed disclosure.

`/me` is a ledger: date, amount, state, time remaining. States are Pending, Claimed, Refundable, and Refunded, in sentence case. An open gift says "Refundable in 4d 2h" rather than sitting in an amber pill.

Motion is one 180ms settle. Corners are 12px on controls and 16px on the card. The navbar shows "Wrong network" and a switch action when the connected wallet is not on chain 10143. The spelling check under the recipient field sits under the row, not beside the input.

## Docs that were wrong

`README.md` said 20 tests. `test/TipJar.t.sol` has 30 `test_*` functions. The runbook used `@metropolis_tester`, which is 18 characters, and X handles stop at 15. The runbook now uses `@doro_tester`, names the current buttons, and quotes the real mismatch message: `Authenticated X account @other_user does not match the tip recipient.`

## Left for a redeploy

These are still in `SECURITY-DEBT.md`. Changing them means a new address. Old gift ids do not move.

| Item | What is still true |
| --- | --- |
| SD-01 | `createdAt` and `expiresAt` are `uint40` in the deployed struct. Not exploitable for a very long time. The app must keep decoding `uint40`. |
| SD-02 | A malformed claim signature reverts with OpenZeppelin's `ECDSA` errors. |
| SD-03 | `refund()` does not set `claimedBy`. The app tells refunded from claimed using the zero address and a zero amount. |
| SD-04 | The one-hour signer timelock is in `src/TipJar.sol` and in the Foundry tests. It is not in the deployed bytecode. |
| SD-05 | The contract does not check `handleHash` on claim. The server does. Accepted for this testnet demo. |
| SD-06 | The voucher limiter is process-local. |
| SD-07 | `ARCHITECTURE.md` still cites tests and scripts that are not the ones in the repo. |
| SD-08 | There is no automated test of `/api/claim` against a live Privy token. |
| SD-09 | `claim()` does not zero `amount`. `classifyGift` does not treat a non-zero amount with a recipient as a refund. |

`forge test` was not re-run. The contract source was not edited.

## Checks

App unit tests, from `app/`: `npm test` on 7 October 2026. 101 passed, 0 failed, 1 skipped. The skip is the live X profile lookup, which returned no profile (rate limit or a degraded response). The sibling test, a handle that does not exist, returned null as expected.

Browser checks used the dev server at `http://localhost:3000` (Playwright, Chromium). No page errors.

- Send, at 1280px and 390px. Ground is `rgb(20, 18, 16)`. The title is Fraunces. The body is Schibsted Grotesk. The page does not contain "10,000 TPS", "Salted", "Celestial", "Auto Refund", "unwrap", or "hackathon". The footer faucet is `https://faucet.monad.xyz`. Typing a handle puts "Looking up that handle…" under the field, not beside it. Four couriers render. Selecting one sets `aria-pressed`. Quick amounts write the chosen value. The page does not scroll sideways at 390px.
- Connect dialog. "Get testnet MON" links to `https://faucet.monad.xyz`. Close dismisses it.
- `/me` while signed out. The empty state asks for the sending wallet.
- `/claim/nope`. "No gift here", with no RPC error.
- `/claim/1` while the RPC was briefly unreachable. "Couldn't load this gift" and Try again, not "No gift here".
- `/claim/4?m=chog-cyber&n=See%20you%20soon` after the RPC answered. Gift 4 is still pending on the deployed contract. The card shows Chog Cyber, 0.1 MON, the note "See you soon", and the line that the note and courier travel with the link. Checked at 1280px and 390px.
- `/claim/1` once the RPC answered. "Already claimed", with the claimer address.

Not exercised in the browser: signing a send or a claim, the external-wallet disclosure (it opens only after X login), a wrong-network wallet, and a connected `/me` ledger. Those paths are covered by the unit tests for link building, gift classification, and voucher reservation, and by reading the page code. `forge test` was not re-run.
