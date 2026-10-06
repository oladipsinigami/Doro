# TipJar — Monad Metropolis Hackathon 🏺⚡

**TipJar** is a trust-minimized social escrow protocol for Monad Testnet that lets anyone tip native MON to any X (Twitter) handle. 

Recipients authenticate through [Privy](https://privy.io) with their X account, derive an embedded Ethereum wallet, receive an EIP-712 server-signed voucher proving their handle ownership, and claim their funds on-chain. If left unclaimed past 7 days, the sender can execute a full refund.

Built for the **Monad Metropolis Hackathon (October 2026)**.

---

## 1. Verified Testnet Deployments & Network Details

* **Chain**: Monad Testnet
* **Chain ID**: `10143`
* **RPC Endpoint**: `https://testnet-rpc.monad.xyz`
* **Contract Address**: [`0xa7a9ACAc332C398B61f7459215Fd4f5522686b88`](https://testnet.monadscan.com/address/0xa7a9ACAc332C398B61f7459215Fd4f5522686b88)
* **Deployment Tx**: [`0xfd680968fd2c91f92f41a13515e2fb3cd61dea7ad15d571faf0d9588b3f303f6`](https://testnet.monadscan.com/tx/0xfd680968fd2c91f92f41a13515e2fb3cd61dea7ad15d571faf0d9588b3f303f6)
* **Deployer / Owner**: `0xdB99D8C6b401cF97eaE6c835345938edF5299d25`
* **Contract Verification**: ✅ **Verified on Sourcify / MonadVision** (Status: `perfect` bytecode match)
* **Explorers**: [Monadscan](https://testnet.monadscan.com/address/0xa7a9ACAc332C398B61f7459215Fd4f5522686b88) • [MonadVision](https://testnet.monadvision.com/address/0xa7a9ACAc332C398B61f7459215Fd4f5522686b88)
* **Faucet**: [https://faucet.monad.xyz](https://faucet.monad.xyz)
* **Contract Source**: [`src/TipJar.sol`](./src/TipJar.sol)

---

## 2. Architecture & Security Guarantees

```
┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
│     SENDER      │             │  CLAIM SERVER   │             │   RECIPIENT     │
│  (Any Wallet)   │             │ (Node / Privy)  │             │(Embedded Wallet)│
└────────┬────────┘             └────────┬────────┘             └────────┬────────┘
         │                               │                               │
         │ 1. POST /api/hash-handle      │                               │
         │──────────────────────────────>│                               │
         │    <salt + @handle>           │                               │
         │<──────────────────────────────│                               │
         │                               │                               │
         │ 2. createTip(handleHash)      │                               │
         │─────────────────────────┐     │                               │
         │ (locks native MON)      │     │                               │
         │                         ▼     │                               │
         │                 ┌───────────────┐                             │
         │                 │  TipJar.sol   │                             │
         │                 └───────────────┘                             │
         │                               │  3. POST /api/claim           │
         │                               │<──────────────────────────────│
         │                               │  (Privy token verification)   │
         │                               │                               │
         │                               │  4. Returns EIP-712 Voucher   │
         │                               │──────────────────────────────>│
         │                               │                               │
         │                               │  5. claim(tipId, rec, ddl, sig)
         │                               │  (executes from embedded wallet)
         │                         ┌─────┴─────────┐                     │
         │                         │  TipJar.sol   │<────────────────────│
         │                         │ (transfers MON)                     │
         │                         └───────────────┘                     │
```

### Security Guardrails:
1. **Zero Client Handle Trust**: The browser never decides who owns an X handle. The server resolves identity strictly from verified Privy session tokens and server-side profile queries.
2. **Replay & Front-Running Immunity**: Vouchers are signed using EIP-712 bound to `chainId: 10143`, `verifyingContract`, `tipId`, `recipient`, and a short 10-minute `deadline`. The contract strictly enforces `require(msg.sender == recipient)`, making mempool frontrunning impossible.
3. **Pre-Transfer State Writes**: State is updated (`claimed = true`) before the value transfer, preventing reentrancy.
4. **Server Signer Isolation**: The server's private key (`CLAIM_SIGNER_PRIVATE_KEY`) signs vouchers only and never sends transactions.

---

## 3. Repository Structure

```text
tipjar/
├── foundry.toml                  # Foundry configuration (network = "monad", chain_id = 10143)
├── src/
│   └── TipJar.sol               # Core escrow smart contract with EIP-712 & ReentrancyGuard
├── test/
│   └── TipJar.t.sol             # 20 exhaustive unit tests covering all security vectors
├── script/
│   └── Deploy.s.sol             # Foundry deployment script for Monad Testnet
├── app/
│   ├── package.json             # Next.js 15, viem, @privy-io/react-auth, @privy-io/node
│   └── src/
│       ├── app/
│       │   ├── page.tsx         # / route (Send Tip form)
│       │   ├── claim/[id]/page.tsx # /claim/[id] route (Claim flow with X login)
│       │   ├── me/page.tsx      # /me route (Sender history & refunds)
│       │   └── api/
│       │       ├── hash-handle/ # POST /api/hash-handle
│       │       └── claim/       # POST /api/claim (Voucher signer)
│       ├── lib/
│       │   ├── chain.ts         # Monad Testnet viem chain definition
│       │   ├── tipjar.ts        # Contract ABI and EIP-712 types
│       │   └── signer.ts        # Server-only EIP-712 cryptographic signer
└── README.md
```

---

## 4. Setup & Testing

### Smart Contract Unit Testing
Foundry v1.8.0+ is required with native `network = "monad"` support:

```bash
# Run all 20 tests (100% green)
forge test -vv
```

### Deploy to Monad Testnet
```bash
# 1. Populate .env with DEPLOYER_PRIVATE_KEY and CLAIM_SIGNER_ADDRESS
cp .env.example .env

# 2. Deploy contract to Monad Testnet
forge script script/Deploy.s.sol:DeployTipJar \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast
```

### Run Frontend & API Server
```bash
cd app
npm install
npm run dev
```

---

## 5. End-to-End Demo Runbook

1. **Step 1 — Fund Sender Wallet**: Ensure your sender wallet has at least 0.05 MON from `https://faucet.monad.xyz`.
2. **Step 2 — Lock Tip**: Navigate to `http://localhost:3000/`, enter `@metropolis_tester`, enter `0.02 MON`, and click **Send Tip**. Confirm transaction on Monad Testnet.
3. **Step 3 — Successful Claim**:
   - Open an Incognito window and visit the shareable claim link (`http://localhost:3000/claim/0`).
   - Click **Login with X** and authenticate as `@metropolis_tester`.
   - Privy generates an embedded wallet.
   - Click **Claim 0.02 MON** to sign and broadcast the claim on-chain.
4. **Step 4 — Negative Test (Unauthorized Claim Rejection)**:
   - Open a second Incognito window and visit `http://localhost:3000/claim/0`.
   - Log in with a different X account (`@other_user`).
   - The UI immediately displays: `Error 403: Authenticated X account does not match tip recipient`. The claim is rejected.
