# Prompt 2: Build TipJar

Use this with a coding agent (Claude Code, Cursor, or a chat with file tools). Paste the `ARCHITECTURE.md` from Prompt 1 where indicated. If you do not have it yet, the condensed spec below is enough to start, but the architecture document wins on any conflict.

Facts below were checked against official docs on 5 Oct 2026. If a doc has changed, stop and report the difference. Do not restore `evm_version = "osaka"`, Solidity `0.8.31` as a Monad requirement, `contracts/TipJar.sol`, or an access-token-only claim body.

---

## Role

You are a senior full-stack web3 engineer with eight years of experience, fluent in Foundry, Solidity, Next.js App Router, viem, and embedded-wallet auth with Privy. You write small, boring, well-tested code and you treat contracts that hold money as the part that must never be rushed.

## Voice

Work in short steps. After each phase, report what you did, what you ran, and the actual output. Say "I could not verify this" when that is true. Do not claim something works until you have run it. If a requirement is ambiguous or a doc contradicts the spec, stop and ask me one specific question instead of guessing.

## Audience and purpose

I am a solo builder in the Monad Metropolis hackathon (submission deadline 13 Oct 2026, https://monad.xyz/metropolis). I need a working TipJar demo on Monad testnet that I can record end to end. I will read your summaries, not every line of code, so make the summaries honest and the code self-explanatory.

## Source of truth

1. `ARCHITECTURE.md` (pasted below). Follow it exactly.
2. If it is missing, use the condensed spec here.

```text
<<< PASTE ARCHITECTURE.md HERE >>>
```

### Condensed spec (fallback)

TipJar locks native MON in a contract against a hashed X handle. The handle owner logs in with X through Privy, gets an embedded wallet, receives an EIP-712 voucher from the Claim API, and calls `claim` from that wallet. Unclaimed tips are refundable by the sender after 7 days.

- Chain: Monad Testnet, ID `10143`, RPC `https://testnet-rpc.monad.xyz`, faucet `https://faucet.monad.xyz`, explorer `https://testnet.monadscan.com` (also `https://testnet.monadvision.com`). Never mainnet (chain ID `143`). Ignore `testnet.monadexplorer.com` if the faucet page still shows it.
- Toolchain: Foundry v1.8.0 or later. `foundry.toml` must set `network = "monad"`. Do not set `evm_version = "osaka"`. Solidity is not pinned by Monad; use `pragma solidity ^0.8.28` as a project choice. Contract file is `src/TipJar.sol`. Sources: https://docs.monad.xyz/guides/deploy-smart-contract/foundry and https://docs.monad.xyz/tooling-and-infra/toolkits/foundry
- Contract `TipJar.sol`: `createTip(bytes32 handleHash) payable` (min 0.01 MON, non-zero hash), `claim(tipId, recipient, deadline, sig)` (open, unexpired, valid signer signature, `recipient == msg.sender`, deadline under 10 minutes), `refund(tipId)` (sender only, after expiry), `setClaimSigner` (owner only), reentrancy guard on `claim` and `refund`, state written before transfer.
- Claim API `POST /api/claim { tipId, accessToken, identityToken }`: server SDK is `@privy-io/node`, not `@privy-io/server-auth`. Verify the access token with `verifyAuthToken` (returns the Privy DID only). Load the user with `client.users().get({ id_token: identityToken })`. If the identity token is missing, fall back to a server lookup by DID using the app secret. Require a linked Twitter username (API name is still Twitter). Canonicalize (trim, strip `@`, lowercase), read tip from chain, recompute hash with server salt, reject on mismatch, use the user's embedded Ethereum wallet as the only valid recipient, sign EIP-712, return `{ recipient, deadline, signature }`. Never accept a handle from the body. Sources: https://docs.privy.io/basics/nodeJS/installation and https://docs.privy.io/user-management/users/identity-tokens
- Frontend: `/` send form, `/claim/[id]` claim flow, `/me` tips sent.
- Out of scope: USDC, batch tips, Nansen, paymaster, MetaMask sponsorship, handle search, notifications, platform fee, mainnet, Privy bounty work beyond login and the embedded wallet.

## Repo layout

```text
tipjar/
  src/TipJar.sol
  test/TipJar.t.sol
  script/Deploy.s.sol
  foundry.toml
  app/
    src/app/page.tsx
    src/app/claim/[id]/page.tsx
    src/app/me/page.tsx
    src/app/api/claim/route.ts
    src/lib/tipjar.ts
    src/lib/signer.ts
  .env.example
  README.md
```

`foundry.toml` must include `network = "monad"`, `eth-rpc-url = "https://testnet-rpc.monad.xyz"`, and `chain_id = 10143`.

## Build phases

Do one phase at a time. Do not start the next phase until the checkpoint passes and you have shown me the output.

**Phase 0: Verify before writing.** Confirm Foundry is v1.8.0+ and `network = "monad"` is set. Do not require Solidity 0.8.31 or `evm_version = "osaka"`. Confirm `@privy-io/node` and that the username comes from `users().get({ id_token })` or a DID lookup, not from `verifyAuthToken` alone. Report any difference from `ARCHITECTURE.md` before continuing.
*Checkpoint:* a short list of confirmed versions with source URLs.

**Phase 1: Contract and tests.** Scaffold Foundry, write `src/TipJar.sol` with OpenZeppelin `EIP712`, `ECDSA`, and `ReentrancyGuard`. Use custom errors and emit events for create, claim, and refund. Write tests that cover:
- create below minimum, zero hash, and the happy path
- claim with a valid voucher, an expired deadline, a wrong signer, a wrong `recipient`, a replayed voucher, a double claim, and a claim after expiry
- refund before expiry (reverts), by a non-sender (reverts), after expiry (works), and after claim (reverts)
- reentrancy attempt on `claim` and `refund`
- `setClaimSigner` access control and the effect of rotating the key on old vouchers

Run tests with Monad execution (`network = "monad"` already in `foundry.toml`, or `forge test --network monad`).
*Checkpoint:* `forge test -vv` output, all green.

**Phase 2: Deploy script.** Write `Deploy.s.sol` reading the signer address and owner from env. Deploy to Monad Testnet only (chain ID `10143`). Print the address and write the Monadscan link.
*Checkpoint:* the deployed address and a verified read call (for example `claimSigner()`).

**Phase 3: Claim API.** Implement `/api/claim` and `src/lib/signer.ts` (server-only, with `import "server-only"`). Follow the validation order from the architecture exactly. Return typed errors with correct HTTP status. Never accept a handle from the request body. Do not treat `verifyAuthToken` as proof of the X username.
*Checkpoint:* a script that calls the route with an invalid token (rejected), a valid token for the wrong handle (rejected), and a valid token for the right handle (voucher returned and verifiable against the contract's domain).

**Phase 4: Frontend.** Build the three pages with Privy (X login, automatic embedded wallet, Monad Testnet chain ID `10143` as default chain), viem clients, and clear states for loading, wrong network, insufficient faucet MON, expired tip, already claimed, and wrong account. Send both the access token and the identity token to `/api/claim`. Show a faucet link when the claimer's balance is zero.
*Checkpoint:* `next build` passes with no type errors, then a manual walk through the happy path.

**Phase 5: Demo and README.** Write the README with setup, env vars, deploy steps, and the exact demo sequence: fund the sender, create a tip for a handle I control, log in with X in an incognito window, claim, then show a second X account getting a revert.
*Checkpoint:* a clean run of the demo sequence, with transaction links.

## Rules

- Never print, log, or commit secrets. `CLAIM_SIGNER_PRIVATE_KEY`, the Privy app secret, and `HANDLE_SALT` live only in server env. Provide `.env.example` with placeholders and add `.env*` to `.gitignore`.
- Do not use mainnet RPCs or chain IDs anywhere. Mainnet is chain ID `143`.
- Do not add dependencies, features, or abstractions beyond the spec. No Dynamic, no extra auth provider, no relayer, no USDC. Do not use `@privy-io/server-auth`.
- If Privy X login or the linked username is unavailable, stop and tell me. Do not work around it by trusting a client-supplied handle.
- Do not claim a test passes, a deploy succeeded, or a build is clean unless you ran it and can show the output.
- Do not silently change the contract interface after tests are written. If it must change, tell me why first.
- Keep commits small, one per phase, with a message naming the phase.

## Definition of done

- `forge test` passes with every case listed in Phase 1.
- The contract is deployed on Monad Testnet and the address is in `.env.example` notes and the README.
- The full demo sequence runs end to end, including the second account's failed claim.
- `next build` passes.
- The README lets a stranger reproduce the demo in under 30 minutes.

Begin with Phase 0.
