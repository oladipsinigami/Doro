# Security Debt — Doro (δῶρο)

Open items from the 2026-10 audit and post-hackathon triage. Items closed during
the build are listed at the bottom so the reasoning survives.

**Status key:** `Open` · `Fixed (needs redeploy)` · `Accepted risk`

The deployed contract is `TipJar` at
`0xa7a9ACAc332C398B61f7459215Fd4f5522686b88` on Monad Testnet (chain 10143).
Some fixes below change contract bytecode and therefore require a redeploy.

---

## Open

### SD-01 · High (latent) · `src/TipJar.sol`

`uint40` timestamps truncate `block.timestamp` silently. Max representable value
is ~year 36812; beyond that `expiresAt` wraps *downward*, which would make an
expired tip appear unclaimed and permanently lock its escrow.

**Not exploitable today.** Unreachable for ~34,000 years.

**Closed when:** `createdAt` / `expiresAt` are `uint256`. Gas cost is negligible;
the struct packing pressure noted in `ARCHITECTURE.md` §4 does not justify the
latent wrap. Do this the next time the contract is edited anyway.

---

### SD-02 · High · `src/TipJar.sol` `claim()`

`ECDSA.recover` reverts with `ECDSAInvalidSignature` / `ECDSAInvalidSignatureLength`
rather than the contract's own `InvalidSigner()` on a malformed signature.

**Impact:** cosmetic. Distinguishing error selectors leaks no secret, but it
means callers see OpenZeppelin's errors rather than Doro's documented set.

**Closed when:** switched to `ECDSA.tryRecover` with an explicit
`InvalidSigner()` revert.

---

### SD-03 · Medium · `src/TipJar.sol` `refund()`

`refund` sets `claimed = true` but never `claimedBy`, so `getTip` reports
`claimedBy == address(0)` for refunded tips. `claim` sets both.

**Impact:** accounting inconsistency only. `amount` is zeroed and the
`claimed` flag blocks re-entry, so no value is at risk.

**Closed when:** `claimedBy` is set alongside `claimed` in `refund`.

---

### SD-05 · Critical (architectural) · `src/TipJar.sol` `claim()`

`claim()` never reads `tip.handleHash`. The handle-to-wallet binding exists only
in server memory (`app/src/app/api/claim/route.ts`), so every on-chain control —
replay protection, frontrunning defence, signer isolation — assumes the signer
cannot be induced to sign for the wrong person.

**Severity is capped by `msg.sender == recipient`** (`claim` line ~127): a
compromised signer alone yields *griefing*, not theft, because funds can only be
released to the address that broadcasts the claim. That cap is what makes this
defensible for a testnet demo.

**Accepted risk for the hackathon**, on two conditions:

1. `CLAIM_SIGNER_PRIVATE_KEY` stays off-chain and never enters a repo, log, or
   screenshot. If it leaks, rotate immediately via the SD-04 timelock.
2. This limitation is documented in the submission rather than omitted.

**Closed when:** the voucher struct carries `handleHash` and the contract
asserts the handle commitment on-chain. This is a redesign, not a patch.

---

### SD-06 · High (ops) · `app/src/lib/rate-limit.ts`

The limiter is process-local and therefore correct only for a single instance.
On serverless (Vercel) each invocation may get a cold store, so the effective
limit is `max × instances` and may never fire.

**Impact:** voucher-issuance cooldown is weaker in production than in local
testing. Does not affect correctness of a single claim — only the abuse
resistance against signer-oracle abuse (see SD-05).

**Update (2026-10-07):** the two claim routes now share one process-local
limiter, `app/src/lib/voucher-limit.ts`. The slot is reserved only when
signing starts, and `release()` gives it back if signing throws. A failed
handle check or a missing wallet no longer burns the minute. This does not
close SD-06. A second server process still has its own map.

**Closed when:** backed by a shared store (Redis, Upstash, or Vercel KV).

---

### SD-07 · Info · `ARCHITECTURE.md`

Documentation has drifted from the implementation:

- §9 cites `test_ClaimAPI_IgnoresBodyHandle()` as verification for the
  "Client Identity Spoofing" threat. No such test exists in `test/`. The
  behaviour it describes *is* enforced — by `app/src/lib/claim-request.ts` and
  `app/src/lib/claim-auth.ts`, both of which do have tests — but the citation is
  wrong.
- §9 claims rate limiting on `POST /api/hash-handle` as a mitigation. That did
  not exist when the audit was written and now does (20 requests/min per client).
- §10 references `script/test-e2e.sh`. No such file. The real script is
  `app/scripts/test-claim-api.mjs`.

**Closed when:** the citations are corrected to name the actual test files, or
the rows are removed.

---

### SD-08 · Low · `app/src/app/claim/[id]/page.tsx`

Reentrancy in the claim flow is covered by Foundry tests at the contract level
but there is no integration test exercising `/api/claim` or `/api/claim/wallet`
against a live Privy token. The only coverage of those routes is manual.

**Closed when:** a scripted integration test drives the claim route with a real
(or Privy test-account) token.

---

### SD-09 · Info · `src/TipJar.sol` `claim()`

`claim()` does not zero `tip.amount` after releasing it, so `getTip` keeps
reporting the original value for a claimed tip. `refund()` does zero it.

**Impact:** none. The `claimed` flag blocks both re-entry and refund, and the
contract holds no liability for a claimed tip. Recorded so the asymmetry is a
decision on record rather than an oversight.

---

## Fixed — redeploy required

### SD-04 · Medium · `src/TipJar.sol` `setClaimSigner` — FIXED, NEEDS REDEPLOY

Signer rotation used to take effect immediately. A compromised owner key could
repoint `claimSigner` and authorize claims against every open escrow in a single
transaction, with no window in which to notice or intervene.

**Fix:** two-phase rotation with a 1-hour timelock.

- `setClaimSigner(address)` — owner only, queues the change and emits
  `ClaimSignerChangeQueued`
- `acceptClaimSigner()` — permissionless, applies the change once matured
- `cancelClaimSignerChange()` — owner only, aborts a pending change

The current signer keeps working during the window, so vouchers already issued
stay valid and a rotation cannot strand funds.

Covered by 10 new Foundry tests, including the attack scenario
(`test_CancelClaimSignerChange_BlocksCompromisedRotation`) and the invariant that
a queued rotation does not invalidate in-flight vouchers.

**Consequence:** this changes bytecode. The deployed contract still has the
instant `setClaimSigner`. Redeploy to pick this up — note that redeploying gives
a new address, so any gift hash committed against the old `handleHash` salt
scheme remains valid but old gift IDs will not carry over.

**Rotation procedure after redeploy:**

```bash
cast send <CONTRACT> "setClaimSigner(address)" <NEW_SIGNER> --interactive
# wait 1 hour
cast send <CONTRACT> "acceptClaimSigner()" --interactive
```

---

## Closed during the build

| Was | Resolution |
| --- | --- |
| Unbounded voucher issuance (Critical) | Per-tip cooldown keyed on verified user, shared across the embedded and external-wallet paths. `app/src/lib/rate-limit.ts`, 11 tests. |
| Client could inject `handle` / `recipient` / `deadline` / `signature` into the claim body | Allowlisted extraction; identity fields are absent from the return type. `app/src/lib/claim-request.ts`, 22 tests. |
| External-wallet path could redirect a gift to an arbitrary address | EIP-191 ownership proof bound to address + giftId + chainId, verified server-side before any voucher is signed. `app/src/lib/claim-auth.ts`, 13 tests. |
| Handle enumeration via `/api/hash-handle` | Rate limit (20/min per client), input validation, generic errors. |
| Internal error strings returned to clients | Both catch-alls now log server-side and return a generic message. |
| Hardcoded fallback claim signer in `Deploy.s.sol` | Reverts when `CLAIM_SIGNER_ADDRESS` is unset. |
| Embedded wallet read from `user.linkedAccounts` | Privy v3 stores wallets on `user.wallets`. `app/src/lib/privy-user.ts`, 15 tests. |
| Privy auto-creation hang after OAuth | Manual `createWallet()` fallback in the claim UI. |
| Recipient with no gas could not claim | External-wallet claim path; recipients pay gas from their own wallet. |
| Placeholder `HANDLE_SALT` in use | Replaced with 32 CSPRNG bytes. A published salt lets anyone precompute hashes for every public handle and map all pending gifts. |
| `ARCHITECTURE.md` runbook used `@metropolis_tester` | 18 characters; X caps handles at 15. The documented demo handle could never exist. |

---

## Standing risks

Not debt — accepted properties of the design, worth remembering at demo time.

- **Claimer must have gas.** `msg.sender == recipient` means nobody can pay
  another person's gas. Embedded-wallet claimants must be funded first; external
  wallet claimants pay their own. If Privy-sponsored gas becomes available for
  Monad Testnet, this disappears — it requires a paymaster URL that Privy's
  providers do not currently offer for chain 10143.
- **Embedded wallets require `https://`** outside `localhost`. Plain-HTTP
  deployments fail silently at wallet creation because WebCrypto is unavailable.
- **Handle renames break gifts.** A tip commits to a handle string. If someone
  renames their X handle after being gifted, the gift becomes unclaimable. Bounded
  by the 7-day refund window. `ARCHITECTURE.md` Gap 3 documents this as an
  explicit v1 decision.
