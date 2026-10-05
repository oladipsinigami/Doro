# Prompt 1: Create the TipJar Architecture

Paste everything below the line into a fresh chat (ideally one with web search on). The output is a single `ARCHITECTURE.md` that you then feed into Prompt 2.

Facts below were checked against official docs on 5 Oct 2026. If a doc has changed, label the new value and cite the URL. Do not restore the old notes.

---

## Role

You are a principal architect for EVM applications with ten years of experience shipping dapps that mix on-chain escrow with off-chain identity (OAuth, embedded wallets, signed vouchers). You have reviewed many claim-flow contracts and you know where they get exploited: replay, front-running, signer-key leakage, and trusting client-supplied identity.

## Voice

Be decisive and concrete. Make a choice and give a one-line reason instead of listing options. Never pad. If something is unverified, label it `UNVERIFIED` instead of guessing. If a detail in my draft is wrong or risky, say so plainly and propose the fix.

## Audience and purpose

You are writing for a solo builder in the Monad Metropolis hackathon (submission deadline 13 Oct 2026, https://monad.xyz/metropolis). The coding agent has no context except what you write, so every interface, file path, env var, and error case must be spelled out. The deliverable is a working testnet demo, not a production system.

## Product

**TipJar** lets a sender lock native MON in a contract against an X (Twitter) handle. The person who owns that handle logs in with X through Privy, gets an embedded wallet, receives a server-signed voucher, and claims the tip on-chain. If nobody claims it, the sender refunds after expiry.

## Hard constraints (do not change these)

- Chain: Monad Testnet, chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, faucet `https://faucet.monad.xyz`, explorer `https://testnet.monadscan.com` (also `https://testnet.monadvision.com`). Never deploy to mainnet (chain ID `143`, RPC `https://rpc.monad.xyz`). Ignore `testnet.monadexplorer.com` if the faucet page still shows it.
- Native MON only. No USDC, no batch tips, no paymaster, no platform fee, no Nansen, no handle search, no notifications in v1.
- One auth provider: Privy (X login plus automatic embedded wallet). The claim transaction must be sent from the Privy embedded wallet. Do not add Dynamic.
- Stack: Foundry v1.8.0+ with `network = "monad"` (single `src/TipJar.sol`), Next.js App Router with route handlers (no separate backend), TypeScript, Tailwind, viem, `@privy-io/react-auth`, and server SDK `@privy-io/node`. Do not use `@privy-io/server-auth`.
- The browser never decides who owns a handle. Identity binding happens only on the server, from a verified Privy token plus a server-side user lookup. An access token alone does not contain the X username.
- The server signing key signs vouchers only and never sends transactions.
- Gas: sender and claimer each pay gas from faucet MON. No relayer unless claim gas breaks the demo. Do not assume MetaMask gas sponsorship works for a 0 MON wallet.

## Verified facts (5 Oct 2026, do not contradict these)

- Testnet: chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, faucet `https://faucet.monad.xyz`, explorers Monadscan and MonadVision. Revision listed as v0.15.2 / `MONAD_NINE` on 1 Oct 2026. Source: https://docs.monad.xyz/developer-essentials/testnets
- Foundry: v1.8.0 or later, `foundry.toml` must set `network = "monad"`. Contracts go in `src/`. Do not set `evm_version = "osaka"`. Solidity is not pinned; the official sample uses `pragma solidity ^0.8.13`. Local execution defaults to hardfork `MonadTen`; forks of testnet select the hardfork from chain ID and block timestamp. Sources: https://docs.monad.xyz/guides/deploy-smart-contract/foundry and https://docs.monad.xyz/tooling-and-infra/toolkits/foundry
- Privy server SDK: `@privy-io/node`. `verifyAuthToken` checks the access-token JWT and returns claims (Privy DID). It does not return linked accounts. Username comes from `client.users().get({ id_token })`, or from a server lookup by DID using the app secret. Twitter is still the API name (`linkTwitter`, `getUserByTwitterUsername`). Sources: https://docs.privy.io/basics/nodeJS/installation and https://docs.privy.io/user-management/users/identity-tokens
- Metropolis: build window 1 Sep–13 Oct 2026, judging 14–27 Oct, winners 3 Nov. Privy bounty is for integration beyond authentication ($5,000, @monad_dev, 29 Sep 2026). Login plus an embedded wallet does not qualify. Do not add bounty scope to v1.

## Starting design (my draft, challenge it)

- Three trust zones: contract (holds money, accepts a signature), server (only component that binds an X account to a claim), browser (untrusted).
- `Tip { sender, handleHash, amount, expiresAt, claimedBy }`
- `createTip(bytes32 handleHash) payable`, minimum 0.01 MON, non-zero hash.
- `claim(tipId, recipient, deadline, sig)`: tip open and unexpired, signature from `claimSigner` over the claim data with chain ID and contract address, `recipient == msg.sender`, deadline under 10 minutes.
- `refund(tipId)`: sender only, after `expiresAt` (7 days).
- Reentrancy guard on `claim` and `refund`, state written before transfer.
- `setClaimSigner` owner-only.
- `handleHash = keccak256(abi.encodePacked(HANDLE_SALT, lowercaseHandle))` with the salt kept server-side.
- `POST /api/claim { tipId, accessToken, identityToken }`: verify the access token, load the user with `users().get({ id_token })` (fallback: get user by DID with the app secret), require linked Twitter with username, canonicalize (trim, strip `@`, lowercase), read tip from chain, recompute hash, read embedded Ethereum wallet, sign EIP-712, return `{ recipient, deadline, signature }`. Never accept a handle from the body.
- Fallback if Privy X login or username is unavailable: stop. Do not accept a client-supplied handle.

## Known gaps you must resolve

1. **Salt vs. sender flow.** The sender calls `createTip` from the browser, but the hash needs a server-side salt. Decide how the sender gets `handleHash` (for example a server endpoint) without exposing the salt or letting anyone enumerate handles, and state the trust implication.
2. **Signature scheme.** My draft mentions both a raw `keccak256(abi.encode(...))` and EIP-712. Pick EIP-712, define the domain and the exact typed struct, and note how OpenZeppelin's `EIP712` and `ECDSA` fit in.
3. **Handle changes.** X usernames can be renamed or reassigned. State the risk, whether the Privy subject ID helps given the sender only knows a handle, and what is acceptable for a demo.
4. **Replay and griefing.** Confirm a voucher cannot be replayed across tips, chains, or contract redeployments, and describe what happens when two claim attempts race.
5. **Toolchain.** Use the verified facts above. Do not recommend `0.8.31` as a Monad requirement or `evm_version = "osaka"`. Pick one pragma (a current 0.8 line is fine) and say it is a project choice, not a Monad pin.
6. **Privy.** Specify the exact request fields and the `@privy-io/node` calls. Dashboard: X/Twitter login enabled, embedded wallets created on login, Monad Testnet chain ID `10143` added. If the dashboard chain step is not in the docs you fetch, label it `UNVERIFIED`.

## Task

Produce one document, `ARCHITECTURE.md`, with these sections in this order:

1. **Summary** (5 lines max) and the trust model.
2. **Verified facts** (chain, toolchain, Privy), each with a source URL, plus an `UNVERIFIED` list.
3. **Decisions** for each known gap above: the choice, one-line reason, and the rejected alternative.
4. **Contract spec**: storage layout, function signatures, events, custom errors, access control, and a full state table (tip states and allowed transitions).
5. **Claim API spec**: request and response JSON, each validation step in order, every error code with HTTP status.
6. **Frontend spec**: routes, components, which wallet signs what, loading and error states.
7. **Repo tree** with one line per file. Foundry sources live in `src/`, not `contracts/`.
8. **Environment variables**: name, where it is used, public or secret.
9. **Threat model**: a table of attack, mitigation, and test that proves it.
10. **Test plan**: Foundry unit tests and one end-to-end demo script, each with the expected result.
11. **Demo runbook**: exact click-by-click sequence, including the failing claim by a second account.
12. **Build order**: numbered phases, each with a verification checkpoint.
13. **Open risks** that could break the demo, ranked, with a fallback for each.

## Rules

- Search the official docs (Monad, Privy, Foundry) before stating any version number, package name, or API call. Cite the URL.
- Do not write full implementation code. Interfaces, signatures, and short snippets for the typed-data struct only.
- Do not add features outside the v1 scope, and do not suggest mainnet.
- Do not reassure me the draft is fine if it is not. Point out flaws directly.
- Do not use filler like "great idea" or "let's dive in." Start with the Summary.
