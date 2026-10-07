# Doro — Build Log & Retrospective

A complete record of the work on **Doro (δῶρο)**, the native MON gifting protocol
for Monad Testnet, from first analysis through a working end-to-end claim.

Written after the fact, from the session's own transcript and the current state of
the repository. Where a number is uncertain or a result was flaky, it says so
rather than picking a flattering figure.

**Session date:** October 2026
**Repo root:** `C:\Users\oladips\Downloads\Monad`
**Stack:** Foundry (Solidity 0.8.28) + Next.js 15 + viem + Privy + Tailwind

---

## Table of contents

1. [Where the project started](#1-where-the-project-started)
2. [Phase 1 — Security audit](#2-phase-1--security-audit)
3. [Phase 2 — Remediation](#3-phase-2--remediation)
4. [Phase 3 — Privy and identity setup](#4-phase-3--privy-and-identity-setup)
5. [Phase 4 — The embedded wallet incident](#5-phase-4--the-embedded-wallet-incident)
6. [Phase 5 — The signer rotation](#6-phase-5--the-signer-rotation)
7. [Phase 6 — The zero-balance problem](#7-phase-6--the-zero-balance-problem)
8. [Phase 7 — Documentation and debt tracking](#8-phase-7--documentation-and-debt-tracking)
9. [Skills used](#9-skills-used)
10. [Mistakes made](#10-mistakes-made)
11. [Final state](#11-final-state)
12. [What remains](#12-what-remains)

---

## 1. Where the project started

The repository contained a working protocol that had never been run end to end by
its author. Twelve commits, a deployed and verified contract, a substantial
architecture document — and no evidence anyone had ever completed a claim.

### What already worked

| Asset | Detail |
| --- | --- |
| `src/TipJar.sol` | Escrow contract, 197 lines, OpenZeppelin EIP712 + ReentrancyGuard |
| Deployed at | `0xa7a9ACAc332C398B61f7459215Fd4f5522686b88` (Monad Testnet, chain 10143) |
| `test/TipJar.t.sol` | 20 Foundry tests, all passing |
| `app/` | Next.js 15 frontend: send, claim, and sender-history routes |
| `ARCHITECTURE.md` | 423 lines of design decisions, threat model, state machine |
| Secrets hygiene | `.gitignore` correct; only `.env.example` tracked in git history |

### What was wrong

The frontend looked finished. It had never been run. `CLAIM_SIGNER_PRIVATE_KEY`
and every Privy key were commented out in `app/.env.local`. The sender dashboard
listed 50 tips by issuing sequential RPC calls. `src/TipJar.flat.sol` — a 156 KB
build artifact — sat in `src/`.

The most consequential finding was that **the security documentation described
mitigations that did not exist in the code.**

---

## 2. Phase 1 — Security audit

### Approach

Loaded two skills: `security-and-hardening` (the only genuine security skill in a
151-skill library) and `all-for-one` for surveying the library honestly rather than
from memory.

The survey produced a blunt result worth recording: **`security-and-hardening` is
entirely web-application oriented.** SQL injection, XSS, CORS, SSRF, session
cookies, GDPR. It contains no reentrancy guidance, no signature-domain analysis,
no integer-width analysis, no access-control patterns for on-chain code.

There is **no Solidity or Foundry skill installed at all.** Searches for
`solidity` and `foundry` both returned zero results. The library is heavily
weighted toward Circle wallet operations, DEX tooling, and trading — blockchain
*operations*, not blockchain *security*.

That gap shaped everything after it: no skill could substitute for reading the
contract.

### Audit findings

Eleven findings across six surfaces.

| # | Sev | Location | Finding |
| --- | --- | --- | --- |
| 1 | Critical | `api/claim/route.ts:182` | Unbounded voucher issuance — one tip mints unlimited 10-minute vouchers |
| 2 | Critical | `TipJar.sol` `claim()` | Contract never reads `tip.handleHash`; handle binding is server-side only |
| 3 | High (latent) | `TipJar.sol:96,101` | `uint40` timestamp truncation, unguarded |
| 4 | High | `TipJar.sol:144` | `ECDSA.recover` reverts with OZ selectors instead of `InvalidSigner()` |
| 5 | High | `api/hash-handle/route.ts` | Unauthenticated, unrated handle-hash oracle |
| 6 | Medium | `api/claim/route.ts:190` | Internal error messages returned to clients |
| 7 | Medium | `TipJar.sol:169` | `refund` sets `claimed` but not `claimedBy` |
| 8 | Medium | `TipJar.sol:183` | No timelock on `setClaimSigner`; single-EOA owner |
| 9 | Low | `TipJar.sol:148,170` | `amount` never zeroed on claim |
| 10 | Low | `Deploy.s.sol:14` | Hardcoded fallback claim signer |
| 11 | Info | `test/TipJar.t.sol` | 4 of 9 §9 threats unasserted |

### Documentation drift

Two `ARCHITECTURE.md` §9 rows cite verification tests that **were never written**:

- `test_ClaimAPI_IgnoresBodyHandle()` — cited as verification for a Critical threat
- Rate limiting on `POST /api/hash-handle` — claimed as a mitigation, not implemented

Also: §10 references `script/test-e2e.sh`, which does not exist. The real script is
`app/scripts/test-claim-api.mjs`.

The claim route *was* in fact correct on identity spoofing — it never accepted a
handle or recipient from the body — but no test enforced it, and the doc asserted
one did.

### A correction worth recording

The audit initially rated Finding 1 as "griefing-based theft: the attacker wins the
race and keeps the gift." **That was overstated and was corrected in-session.**

To obtain a voucher you must pass the handle-hash check, which means you *are* the
handle owner. The genuine defect is that the signer becomes an **unbounded
oracle**: unlimited issuance means a key compromise drains every unclaimed tip
instantly and undetectably, with no consumption semantics to slow it. The fix was
the same; the reasoning behind it changed.

### Key hygiene — clean

- `.gitignore` covers `.env.*`; `git ls-files` confirms only `.env.example` is tracked
- No secrets in git history
- `signer.ts` carries `import "server-only"`, hard-failing the build if pulled client-side
- No `dangerouslySetInnerHTML` anywhere in `app/src`
- `localStorage` limited to a UI preference (`doro_wallet_type`), never a token

---

## 3. Phase 2 — Remediation

### Establishing a baseline

Before changing anything: `forge test` → **20 passed, 0 failed**. The audit had
flagged that these tests were "unconfirmed green," so the baseline was measured
rather than assumed.

### Test infrastructure

`app/` had **no test runner at all**. Node 24 provides native TypeScript
stripping, so `node:test` was used — zero new dependencies.

### New modules (each test-first)

**`app/src/lib/rate-limit.ts`** — fixed-window limiter with injectable clock.
11 tests. Amortized expiry sweep plus a hard `maxKeys` ceiling, so neither a slow
flood nor a distinct-key flood can inflate state.

Two design bugs were caught by tests during development:
- Eviction ran *before* insertion, letting the map exceed its ceiling by one
- The overflow check only ran inside the periodic sweep, so a fast distinct-key
  flood bypassed it entirely within one window

**`app/src/lib/claim-request.ts`** — allowlisted extraction of the claim body.
15 tests. `handle`, `recipient`, `handleHash`, `deadline` and `signature` are not
merely ignored — they are **absent from the return type**, so an injected field
cannot reach the signing path. This is the `test_ClaimAPI_IgnoresBodyHandle()` that
`ARCHITECTURE.md` claimed existed.

### A griefing bug introduced and caught

The first implementation keyed the voucher limiter on `tipId` alone, *before*
authentication. That would let anyone who knew a gift ID burn its cooldown and
lock out the real recipient — a rate limit used as a weapon.

Fixed by verifying the Privy token first, then keying on **tip + verified user**.
The general lesson is recorded here because it applies to any rate limit on an
unauthenticated key.

### A pre-existing build break fixed

`WalletContext.tsx` annotated `getWalletClient` as bare `WalletClient`, which drops
the `chain` generic and made every `writeContract` call fail typecheck. This was
already broken in uncommitted work, and it blocked verification. Fixed by deriving
`DoroWalletClient` from the factory via `ReturnType`.

### Result

| Check | Before | After |
| --- | --- | --- |
| `forge test` | 20 | 20 (contract unchanged in this phase) |
| `npm test` | none | 26 passing |
| `npm run build` | broken | ✓ Compiled successfully |

---

## 4. Phase 3 — Privy and identity setup

This phase produced more incorrect turns than any other, and the reasoning is
recorded because the corrections are instructive.

### Secret generation

Generated a fresh `CLAIM_SIGNER_PRIVATE_KEY` + `CLAIM_SIGNER_ADDRESS` pair and
replaced the placeholder `HANDLE_SALT` (which was the literal example value
`0x0123456789abcdef...`, published in `.env.example`).

Attempting this with Foundry first produced two failures worth noting:
- `cast wallet private-key` does not generate a key — it derives from a mnemonic.
  The correct command is `cast wallet new`.
- `cast wallet new` writes its "success" notice to stderr, which PowerShell's
  `$ErrorActionPreference = "Stop"` converts into a terminating error.

Final approach used `viem`'s `generatePrivateKey` and `privateKeyToAccount` inside
`app/scripts/`, so the pair derives from one source and cannot mismatch. Secrets
were written straight to disk and never echoed to the terminal.

`app/scripts/verify-secrets.mjs` was kept as a permanent check that prints no
secret values. Final run: **8/8 checks passed**, including that the signing key
derives the address on file.

### Privy documentation — three wrong turns

**Turn 1: the localhost callback URL.** Advised setting
`http://localhost:3000` as the X OAuth callback. **Wrong.** Privy operates a shared
X OAuth app; the redirect terminates at `https://auth.privy.io/api/v1/oauth/callback`,
never at a user-supplied URL. No callback registration is needed at all.

**Turn 2: the X developer account.** Advised creating an app at developer.x.com.
**Unnecessary.** The user reported an app was auto-created and no URL requested.
The docs were then checked and confirmed: Privy provides default OAuth credentials
per provider. Creating your own is "best practice" for branding and rate limits,
but optional, and reversible for X.

**Turn 3: dashboard navigation.** Gave confident instructions about where the
embedded-wallets toggle lives. **Could not be confirmed.** Three documentation
fetches failed to establish the current layout, and the honest position — "I have
been guessing at that navigation, and I should stop" — was taken rather than
inventing another plausible path.

### Security review of the Privy setup

Two findings worth preserving from reviewing the login screen:

1. **"Return OAuth tokens" was enabled by default.** This issues real X OAuth
   tokens into the browser. Doro never calls the X API — `route.ts:90-104` reads
   the handle from Privy's linked-accounts record. The tokens provided zero
   benefit while exposing sensitive credentials to an unaudited frontend.
   Recommended disabling.

2. **Default scopes are `users.read, tweet.read`.** Only the user's own profile is
   read. Requesting `tweet.read` directly contradicts the data-protection
   declaration that we do not read posts.

---

## 5. Phase 4 — The embedded wallet incident

The longest debugging sequence in the project.

### Symptom

After successful X login, the Privy modal displayed "Creating your wallet"
indefinitely. The dashboard Users page showed **nothing at all**.

### Hypotheses eliminated

| Theory | Verdict |
| --- | --- |
| Coinbase Smart Wallet warning | **Harmless.** Source inspection confirmed it is a `console.info` about the Coinbase *extension* not supporting chain 10143 |
| Incorrect `createOnLogin` config | **Correct.** `providers.tsx:22-26` matches Privy's documented setup exactly |
| Direct `loginWithOAuth` bypassing the modal | **Ruled out.** `claim/[id]:358` calls `login()` with no arguments |
| Insecure context / WebCrypto unavailable | **Disproved.** The screenshot showed `localhost:3000`, which browsers treat as a secure context |
| Incognito mode | **Unlikely.** Reproduced in a normal window |
| Upstream bug privy-io/examples#152 | **Real match, but unanswered** — and reported for Solana on v3.7.0, not this setup |

An earlier claim that Monad Testnet was unregistered in the dashboard was
**explicitly retracted** as an unverified guess.

### A genuine code bug found while reading

`claim/[id]/page.tsx:30` and `/api/claim:110` both read the embedded wallet from
`user.linkedAccounts`. In Privy v3, wallets live on `user.wallets`;
`linkedAccounts` holds only external accounts such as Twitter.

**This bug was independent of the hang** and would have caused `403
EMBEDDED_WALLET_MISSING` even with a working wallet.

Created `app/src/lib/privy-user.ts` to resolve both shapes — `wallets` and
`linkedAccounts`, camelCase and snake_case — and to **reject malformed addresses
rather than pass them through**, since a wrong recipient silently fails every
claim with `InvalidRecipient`. 15 tests.

### The fix that unblocked it

A manual creation fallback: after an 8-second grace period with no wallet, show a
**Create Wallet** button calling `useCreateWallet().createWallet()`. This converts
a dead end into a working path and hardens the flow against the bug returning
during a demo.

**Honest limit:** this is a workaround for an upstream issue, not a confirmed fix.
If `createWallet()` also hangs, the failure is genuinely Privy-side.

### Standing operational risk

Privy's docs established that **embedded wallets require `https://` outside
`localhost`**, because they depend on the browser's WebCrypto API. Plain-HTTP
deployments fail silently at wallet creation — a permanent spinner, no error.

---

## 6. Phase 5 — The signer rotation

### Error

```
ContractFunctionExecutionError: The contract function "claim" reverted.
Error: InvalidSigner()
  address:   0xa7a9ACAc332C398B61f7459215Fd4f5522686b88
  function:  claim(uint256 tipId, address recipient, uint256 deadline, bytes signature)
  args:      (1, 0x05624DAF27FD10273409878Bce8Bcd7D75A8373e, 1791318561, 0x9ee91bed...)
```

### Diagnosis

On-chain state confirmed the mismatch immediately:

```
on-chain claimSigner : 0xdB99D8C6...9d25   ← from original deployment
our .env signer      : 0xAfA05531...1b87   ← generated this session
```

The contract still trusted the original deployer key. Vouchers were correctly
signed by the new key, so `ECDSA.recover` returned an address the contract did not
recognise.

**This was a direct consequence of the Phase 3 decision.** Rotating the signer
without first confirming the owner key was available converted a five-minute fix
into a blocker. Flagged twice in-session; the warning was not prominent enough.

### The fix

```powershell
cast send 0xa7a9ACAc... "setClaimSigner(address)" 0xAfA05531...1b87 `
  --rpc-url https://testnet-rpc.monad.xyz --interactive
```

`--interactive` prompts for the key so it never enters a file, shell history, or
this transcript. An earlier attempt failed with "Failed to decode private key"
because the value came from `.env.example` — which contains the placeholder
`0x000...000`.

The user ran it. Verified independently rather than trusting the receipt:

```
claimSigner now : 0xAfA05531E7c8850B41da7bC441099F3b29671b87  ✓
```

The event log confirmed `from = 0xdB99D8C6...` with topics decoding as
old signer → new signer.

### Trust boundary maintained

The owner key was never requested in chat, never written to a file by this
session, and never handled by the assistant. The deployer key is the single most
privileged credential in the system — it can repoint the signer and thereby
authorize claims against every open escrow. Keeping it out of an assistant's
reach was a deliberate boundary, and the user ultimately chose to run the
transaction themselves.

---

## 7. Phase 6 — The zero-balance problem

### The error

```
Signer had insufficient balance
Missing or invalid parameters.
```

On-chain balances:

```
claimer wallet 0x05624DAF...  0 MON    ← needed gas
deployer       0xdB99D8C6...  3 MON
```

### Why this mattered more than the error suggested

A real recipient hits this: log in with X → claim → "Signer had insufficient
balance" → no idea what a signer is, or which address to fund → give up.

**No gift application can ask someone to fund a wallet before they have received a
gift.** `ARCHITECTURE.md:415` documented this as a High-impact risk; it had been
read and not acted on.

### The fix — an external-wallet claim path

Recipients who already have a wallet can now claim directly to it. No Privy wallet
provisioning, no faucet detour.

**The security problem this created.** The contract enforces
`msg.sender == recipient`, so a MetaMask claim requires a voucher naming *that*
address. If the client could simply declare it, any authenticated user could
redirect any gift to their own wallet — a total drain of all escrow, and a
reopening of exactly the spoofing hole closed in Phase 2.

**Solution: two independent proofs before any voucher is signed.**

1. **X handle ownership** via Privy — proves the caller owns `@recipient`
2. **Address ownership** — an EIP-191 signature over a challenge binding address +
   gift ID + chain ID. The server recovers it and refuses to sign unless it matches
   the declared address.

`app/src/lib/claim-auth.ts` — 13 tests, including proof that a gift-1 proof cannot
be replayed on gift 2, a testnet proof cannot be reused on mainnet, and that **an
attacker cannot produce a valid proof for someone else's address.**

New endpoint `POST /api/claim/wallet`, sharing the cooldown limiter with the
embedded path so switching routes cannot mint extra vouchers.

### Verified on-chain

```
tip 0  0.1 MON  unclaimed  — stale, refundable after expiry
tip 1  0.1 MON  claimed → 0x05624DAF...  embedded wallet
tip 2  0.5 MON  claimed → 0x8eEC1bfc...  external wallet
tip 3  0.1 MON  claimed → 0xb28678f3...  external wallet
```

Tip 2 came from a different sender (`0x52c66Bf4...`), so both claim paths worked
against the same contract, with multiple senders and recipients.

---

## 8. Phase 7 — Documentation and debt tracking

### The faucet link

`claim/[id]/page.tsx:341` pointed to `https://testnet.monad.xyz` while `README.md`
said `https://faucet.monad.xyz`. Verified rather than assumed:

```
https://faucet.monad.xyz  → 429  (rate-limited, live — this is the faucet)
https://testnet.monad.xyz → 200  (developer hub, which links TO the faucet)
```

The documentation was right; the code was wrong. Fixed.

### Signer timelock (SD-04)

`setClaimSigner` took effect immediately, so a compromised owner key could repoint
the signer and authorize claims against every open escrow in a single transaction,
with no window to intervene.

Replaced with two-phase rotation:

```solidity
setClaimSigner(address)      // owner only, queues + emits ClaimSignerChangeQueued
acceptClaimSigner()          // permissionless, applies after SIGNER_TIMELOCK (1 hour)
cancelClaimSignerChange()    // owner only, aborts
```

`acceptClaimSigner` is permissionless by design — a legitimate rotation should not
be stuck waiting on an owner who may be compromised. The current signer keeps
working during the window, so in-flight vouchers stay valid.

**10 new Foundry tests**, including the attack scenario
(`test_CancelClaimSignerChange_BlocksCompromisedRotation`) and the invariant that a
queued rotation does not invalidate outstanding vouchers.

Two initial test failures were instructive:
- One expected the removed `ClaimSignerUpdated` event on queue
- One warped past the timelock, which expired the 5-minute voucher — **correct
  contract behaviour, wrong test.** Rewritten to re-sign after rotation.

### `SECURITY-DEBT.md`

Nine tracked items across Open / Fixed-needs-redeploy / Closed, each with severity,
location, rationale and closure criteria. Plus twelve closed items recording what
actually resolved them, and a standing-risks section for design properties that are
not debt.

Five inline `// SD-NN:` markers in `TipJar.sol` so debt is visible in the code, not
just a document.

**SD-09 emerged from writing the ledger.** Placing markers forced a read of
`refund()` beside `claim()`, revealing that `claim()` reads `amount` without
zeroing it while `refund()` zeroes it.

This asymmetry **predates every change made in this session** — confirmed against
the original committed `TipJar.sol`, where `claim()` reads at line 148 and never
zeroes, and `refund()` zeroes at line 171. No defect was introduced; an existing
one was documented. Initially phrased as "I added SD-09 by accident," which
invited the wrong conclusion and was corrected.

---

## 9. Skills used

### `security-and-hardening`

The only genuine security skill in the library. Threat-model-first, OWASP-mapped,
with a STRIDE framework and a three-tier boundary system.

Supplied the rate-limiting, secret-handling, error-hygiene and authorization
patterns for findings 1, 2, 5 and 6.

**Its limit is significant and shaped the whole approach:** it is entirely
web-application oriented. No reentrancy, no signature-domain separation, no
integer-width analysis, no Solidity. The critical architectural finding — that the
contract never reads `handleHash` — came from reading the contract, not from any
skill.

It also correctly warns that **in-memory rate limiters silently undercount behind
more than one instance**, which is precisely the deployed-state risk recorded as
SD-06.

### `test-driven-development`

Supplied the red-green discipline that made findings 1 and 4 fixable: both are
*supposed* to be caught by tests that did not exist.

Its "Prove-It Pattern" was applied directly — reproduction test before fix. It also
caught the eviction-ordering bug and the bypassed overflow check in the rate
limiter, both of which would have shipped undetected.

Its guidance on discovering the repository's own tooling led to `node:test` rather
than introducing a test framework, honouring "prefer the project's existing
conventions" when the project has none.

### `verification-before-completion`

"Iron Law: no completion claims without fresh verification evidence."

Applied literally, and repeatedly. Every claim in this document is backed by a
command output captured in the session. Where verification was not possible, that
is stated — several times, including the case where a rate-limit test appeared to
pass because of an unrelated quoting bug.

The skill also demands that regression tests demonstrate red-green. Two Foundry
tests initially failed *after* being written, revealing real test bugs rather than
revealed contract bugs. Both were fixed honestly rather than by loosening
assertions.

### `all-for-one`

Loaded twice. First for the security skill survey, later to reason about which
skills were needed for remediation.

Its value was in the **negative findings**: confirming that no Solidity or Foundry
skill exists, that `ponytail-audit` and `code-review-and-quality` match "audit" but
hunt over-engineering rather than vulnerabilities, and that `impeccable` matches
"harden" but is a frontend design tool.

### `role-persona-prompting`

Used to construct the auditor prompt that structured Phase 1. Layered
identity → expertise → voice → audience, with an explicit negative instruction
("never tell me code is fine when it isn't") to counter the false-authority
failure mode the skill itself warns about.

### Tools

Foundry `forge`/`cast` for tests and on-chain verification; Node 24 with native
TypeScript stripping; `curl` for third-party API verification; `viem` for
cryptography.

---

## 10. Mistakes made

Recorded because they are the most useful part of this document.

### 1. `npm run build` while the dev server was running — twice

Both write to `.next`. The production build clobbers the dev server's chunks,
producing `Cannot find module './4447.js'` and a 500 on `/me`.

Diagnosed by reading the server log rather than guessing, then fixed by stopping
the processes and clearing `.next`. Notably, clearing it **freed 8.4 GB** — a
prior `ENOSPC: no space left on device` failure had been caused by stale build
cache, not a genuinely full disk.

### 2. Signer rotation without confirming owner-key availability

Generating a new signing key was correct advice. Not first confirming the owner key
could be used to register it was not. The consequence: a working contract became
blocked on a credential that turned out not to be stored anywhere in the project.

Flagged twice, insufficiently prominently. **The lesson: rotating a trusted signer
on a live deployment is not a local-only change.**

### 3. Claiming `unavatar.io` works without testing the miss case

Proposed it for existence checking, stating "404s are normal and must not look like
errors" — then never testing whether any 404s existed. They do not:
`unavatar.io` returns **200 with a placeholder image for every input**, so the
"no such account" state was unreachable.

The user reported "it's telling me it doesn't exist" for every handle. This was
my error, discovered only by a user report.

### 4. Fabricated Privy dashboard navigation

Gave confident instructions about toggle locations three times, with no ability to
confirm any of them. Eventually retracted explicitly.

### 5. Reading "0 × 200, 0 × 429" as a passing rate-limit test

`curl.exe` on Windows mangles `\"` escapes in `-d` payloads, so the JSON arrived
truncated and every request 500'd. Combined with the `ENOSPC` failure, this
produced a result that looked like a rate-limit measurement and was entirely
meaningless.

Fixed by writing payloads to files. **Recognising that a plausible-looking result
was nonsense took longer than it should have.**

### 6. Overstating Finding 1

See Phase 1. "Griefing-based theft" overstated a defect whose real nature is
unbounded signing authority. Corrected in-session.

### 7. Retracting an unverified Monad chain-support theory

Asserted that Monad Testnet was probably unregistered as a wallet-support chain.
Had no evidence. Retracted explicitly rather than left standing.

### 8. A griefing bug in my own fix

See Phase 3. Keying the voucher limiter on `tipId` before authentication would
have let anyone lock a gift's recipient out. Caught during implementation.

### 9. Two broken builds from the JSX edit

An orphaned `</div>` (33 open, 32 close) and a viem typing error on `signMessage`.
Both caught by actually building.

### 10. Reporting the number instead of the check

"I don't need any keys in `.env`" was answered with reassurance rather than
acknowledging that `app/.env.local` legitimately holds `CLAIM_SIGNER_PRIVATE_KEY`
and that the concern was partly correct.

---

## 11. Final state

### Verification

Measured at the end of the session:

```
forge test        → 30 passed, 0 failed
npm test          → 82 tests, 82 passed, 0 failed  (varies 80-82; see below)
npm run build     → ✓ Compiled successfully
/ /me /claim/1    → 200, 200, 200
POST /api/claim          → 401 on fake token (correct)
POST /api/claim/wallet   → 400 on malformed, 401 on fake token (correct)
```

**On the varying test count:** two live-network tests hit `api.fxtwitter.com`, a
free community service with no SLA. It rate-limits and intermittently serves HTML
fallback pages. The deterministic coverage of the same logic
(`parseProfileBody`: JSON shape, HTML rejection, malformed input) cannot flake. The
live tests were changed to *skip* rather than *fail* on a degraded upstream —
documented in the test file, with the reasoning recorded inline.

**This is a real trade-off:** a skipped test is a test that can silently stop
testing. It was chosen because a flaky failure is worse than an acknowledged gap,
but it is a weakening of verification and should be understood as one.

### Delivered

| Capability | State |
| --- | --- |
| Native MON escrow with 7-day refunds | Working, deployed, 30 tests |
| X handle ownership via Privy | Working, proven on-chain |
| EIP-712 voucher issuance | Working, rate-limited, replay-protected |
| Embedded-wallet claim | Working (required manual creation fallback) |
| **External-wallet claim (MetaMask)** | **Working — proven on-chain** |
| Rejection of wrong X account | Working |
| Sender dashboard with refunds | Working |
| Recipient avatar + handle preview | Working |
| Signer rotation timelock | **Built, not deployed** |

### Test growth

```
Foundry:   20 → 30   (+10 timelock)
Node:       0 → 82   (+728 lines across 5 files)
```

### Working tree

**Nothing committed.** 20 modified files, 15 untracked, on top of a live deployment
whose configuration lives in that same tree. This is the largest outstanding risk in
the project — not a security defect, but a durability one.

---

## 12. What remains

Full detail in `SECURITY-DEBT.md`.

### Requires a redeploy

**SD-04 — signer timelock.** Bytecode change. The deployed contract still has the
instant `setClaimSigner`. Redeploying yields a new address, so gift IDs will not
carry over.

### Open

| ID | Sev | Item |
| --- | --- | --- |
| SD-01 | High (latent) | `uint40` truncation — unreachable for ~34,000 years |
| SD-02 | High | `ECDSA.recover` reverts with OZ selectors, not `InvalidSigner()` |
| SD-03 | Medium | `refund` leaves `claimedBy` unset |
| SD-05 | Critical (arch) | Contract never reads `handleHash` — accepted risk for the demo |
| SD-06 | High (ops) | In-memory rate limiter undercounts on serverless |
| SD-07 | Info | `ARCHITECTURE.md` cites non-existent tests |
| SD-08 | Low | No integration test for the claim routes |
| SD-09 | Info | `claim()` does not zero `amount`; `refund()` does |

### SD-05 — the honest position

The handle-to-wallet binding exists only in server memory. Severity is **capped by
`msg.sender == recipient`**: a compromised signer yields *griefing*, not *theft*,
because funds can only be released to the broadcasting address. That cap is what
makes it defensible for a testnet demo — **provided the limitation is documented in
the submission rather than omitted.**

Closing it properly requires putting the handle commitment in the signed voucher
struct and asserting it in-contract. That is a redesign, not a patch.

### Standing risks

- **Claimer must have gas.** Nobody can pay another person's gas. Embedded-wallet
  claimants need funding first; external-wallet claimants pay their own. Privy
  gas sponsorship would resolve this but requires a paymaster URL that Privy's
  providers do not offer for Monad Testnet (chain 10143).
- **Embedded wallets require `https://`** outside `localhost`.
- **Handle renames strand gifts.** A tip commits to a handle string; renames make
  the gift unclaimable until the 7-day refund. Bounded and documented as an explicit
  v1 decision.

---

## Appendix — reference

| Item | Value |
| --- | --- |
| Contract | `0xa7a9ACAc332C398B61f7459215Fd4f5522686b88` |
| Chain | Monad Testnet, `10143` |
| RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadscan.com` |
| Faucet | `https://faucet.monad.xyz` |
| Claim signer | `0xAfA05531E7c8850B41da7bC441099F3b29671b87` |
| Owner | `0xdB99D8C6b401cF97eaE6c835345938edF5299d25` |
| Privy SDK | `@privy-io/react-auth@3.47.0` |

### Commands

```bash
forge test                                          # contract suite
cd app && npm test                                  # application suite
cd app && npm run build                             # production build
cd app && npm run dev                               # dev server
node scripts/verify-secrets.mjs                     # secret consistency, prints nothing
```

**Note:** never run `npm run build` while `npm run dev` is serving from the same
directory. Both write `.next`.

### Environment variables

| Variable | Scope | Notes |
| --- | --- | --- |
| `MONAD_RPC_URL` | Server | Monad Testnet RPC |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Client | Deployed TipJar |
| `HANDLE_SALT` | **Server only** | 32 CSPRNG bytes. Leaking it exposes every pending gift |
| `PRIVY_APP_ID` / `NEXT_PUBLIC_PRIVY_APP_ID` | Both | Must be exactly 25 chars — `providers.tsx:11` gates on length |
| `PRIVY_APP_SECRET` | **Server only** | Never expose as `NEXT_PUBLIC_` |
| `CLAIM_SIGNER_PRIVATE_KEY` | **Server only** | Authorises voucher signatures for every escrow |
| `CLAIM_SIGNER_ADDRESS` | Server | Must derive from the key above |
| `DEPLOYER_PRIVATE_KEY` | Foundry only | Owner key. Never in `app/` |

---

*Prepared from the session transcript and verified repository state. Figures for
the Node suite vary between runs for the reason documented in §11; contract results
are deterministic at 30/30.*
