# ARCHITECTURE.md: TipJar on Monad Testnet

## 1. Summary and Trust Model

TipJar is an escrow dapp for Monad Testnet that lets anyone lock native MON against a salted hash of an X handle. The handle owner authenticates with X via Privy, derives an embedded wallet, obtains an EIP-712 voucher signed by the backend, and claims the MON on-chain. If left unclaimed past 7 days, the sender can execute a full refund.

### Trust Model
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER (Untrusted)                             │
│  - Never trusted with handle ownership or claim authorization               │
│  - Cannot see HANDLE_SALT; only receives handleHash from server endpoint    │
│  - Submits on-chain transactions signed by user wallet / embedded wallet    │
└───────────────────────┬─────────────────────────────▲───────────────────────┘
                        │ /api/claim (tokens)         │ EIP-712 Voucher
                        ▼                             │ {recipient, deadline, sig}
┌─────────────────────────────────────────────────────┴───────────────────────┐
│                              SERVER (Trusted)                               │
│  - Single authority binding X username to embedded Ethereum wallet          │
│  - Holds CLAIM_SIGNER_PRIVATE_KEY, PRIVY_APP_SECRET, and HANDLE_SALT        │
│  - Validates Privy auth tokens and queries user records server-side         │
│  - Signs EIP-712 claim vouchers only; NEVER broadcasts transactions         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ claim(tipId, recipient, deadline, sig)
                                       ▼ (sent via Browser Embedded Wallet)
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONTRACT (Trust-Minimized)                        │
│  - Holds native MON escrow balances                                         │
│  - Validates EIP-712 signature against immutable/owner-set claimSigner      │
│  - Enforces msg.sender == recipient (eliminates mempool frontrunning)       │
│  - Writes state before value transfers (Checks-Effects-Interactions)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Verified Facts and Unverified List

### Verified Facts
- **Monad Testnet**: Chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, Explorer `https://testnet.monadscan.com` (and `https://testnet.monadvision.com`), Faucet `https://faucet.monad.xyz`. Mainnet chain ID is `143` and must never be targeted. Revision listed as v0.15.2 / `MONAD_NINE` on 1 Oct 2026.  
  *Source:* https://docs.monad.xyz/developer-essentials/testnets
- **Foundry Toolchain**: Foundry v1.8.0 or later supports Monad natively via `network = "monad"` in `foundry.toml`. Monad local execution defaults to hardfork `MonadTen`. Forked testnet execution resolves hardfork via chain ID and timestamp. Contracts live in `src/`. `evm_version = "osaka"` must NOT be set. Official docs use `pragma solidity ^0.8.13`; `^0.8.28` is a safe project choice.  
  *Sources:* https://docs.monad.xyz/guides/deploy-smart-contract/foundry and https://docs.monad.xyz/tooling-and-infra/toolkits/foundry
- **Privy Server SDK**: Package `@privy-io/node` (NOT `@privy-io/server-auth`, which is legacy). `verifyAuthToken` validates the JWT access token and yields only claims/DID. User profile and linked accounts require `client.users().get({ id_token })` or `client.users().get(did)`. Linked Twitter account property name remains `twitter` (`username`, `subject`).  
  *Sources:* https://docs.privy.io/basics/nodeJS/installation and https://docs.privy.io/user-management/users/identity-tokens
- **Hackathon Timeline & Bounty Scope**: Monad Metropolis build window runs through 13 Oct 2026. The $5,000 Privy bounty explicitly requires integration beyond basic authentication and embedded wallets; v1 scope explicitly excludes chasing this bounty to guarantee core deliverable completion.  
  *Source:* https://monad.xyz/metropolis

### UNVERIFIED List
- `[UNVERIFIED]` Whether Monad Testnet (chain ID `10143`) must be manually declared in the Privy Developer Console under "Embedded Wallets > Supported Chains", or if client-side declaration in `supportedChains` via `@privy-io/react-auth` is sufficient without dashboard configuration.

---

## 3. Decisions for Known Gaps

### Gap 1: Salt vs. Sender Flow
- **Choice**: Implement an authenticated or rate-limited route `POST /api/hash-handle` that accepts `{ handle }` and returns `{ handleHash }` computed as `keccak256(abi.encodePacked(HANDLE_SALT, canonicalize(handle)))`.
- **Reason**: Keeps `HANDLE_SALT` strictly server-side so it cannot be extracted from browser bundles, while enabling senders to obtain the required commitment without logging in.
- **Rejected Alternative**: Client-side hashing with an environment variable (`NEXT_PUBLIC_HANDLE_SALT`). Rejected because anyone could scrape the salt and pre-compute a rainbow table of all public X handles to deanonymize all pending tips.

### Gap 2: Signature Scheme
- **Choice**: EIP-712 typed structured data hashing using OpenZeppelin `EIP712` and `ECDSA`.
- **Reason**: Standardizes cross-contract and cross-chain replay protection via strict domain separation (`chainId: 10143`, `verifyingContract: address(this)`) while showing human-readable fields in wallet prompts.
- **Rejected Alternative**: Raw `eth_sign` over `keccak256(abi.encodePacked(...))`. Rejected because it lacks standard domain separation, risks cross-contract signature replay, and produces opaque hex warnings in wallets.

### Gap 3: Handle Changes and Renames
- **Choice**: Bind tips strictly to canonicalized X handles (`trim`, strip leading `@`, `lowercase`) and accept the risk of handle renames as an explicit v1 demo limitation.
- **Reason**: Senders only know the target's public `@handle` at tip time and cannot know a recipient's internal Twitter numeric ID or Privy DID prior to their first login.
- **Rejected Alternative**: Requiring recipients to pre-register their Twitter numeric ID on-chain before receiving tips. Rejected because it destroys the viral unsolicited tipping mechanism.

### Gap 4: Replay and Front-Running Protection
- **Choice**: Bind `recipient == msg.sender` in `TipJar.claim()`, include `tipId` and `deadline` in the EIP-712 struct, set voucher validity to 10 minutes, and update state (`claimedBy = recipient`) before the value transfer.
- **Reason**: Enforcing `recipient == msg.sender` prevents mempool searchers from stealing vouchers; state-before-transfer prevents reentrancy; `tipId` and domain separator prevent replay across tips, contracts, or forks.
- **Rejected Alternative**: Allowing third-party relayers to submit the voucher on behalf of `recipient`. Rejected because without a dedicated paymaster contract, it exposes the claim to frontrunning and griefing.

### Gap 5: Toolchain and Solidity Pragmas
- **Choice**: Use `pragma solidity ^0.8.28` with Foundry v1.8.0+, `network = "monad"` in `foundry.toml`, and default EVM target (no `evm_version = "osaka"`).
- **Reason**: Pragmas `^0.8.28` work out of the box with OpenZeppelin v5 contracts and Monad Testnet without triggering experimental opcode errors.
- **Rejected Alternative**: Specifying `0.8.31` or `evm_version = "osaka"`. Rejected because Osaka contains opcodes not yet supported on Monad Testnet and breaks compilation.

### Gap 6: Privy Verification Sequence
- **Choice**: Frontend passes both `accessToken` and `identityToken` to `POST /api/claim`. The server validates the session with `verifyAuthToken`, fetches profile details via `users().get({ id_token })` (with fallback to `getUser(userId)` using `PRIVY_APP_SECRET`), extracts the linked Twitter username and embedded Ethereum wallet address, and rejects any payload where handle or recipient are supplied by the client.
- **Reason**: Ensures identity verification relies entirely on cryptographic proof and Privy server records rather than client claims.
- **Rejected Alternative**: Relying solely on `verifyAuthToken` claims. Rejected because the decoded access token JWT contains only the Privy DID, not linked social account usernames.

---

## 4. Contract Specification (`src/TipJar.sol`)

### Storage Layout
```solidity
// Struct: 2 words (64 bytes)
struct Tip {
    address sender;        // 20 bytes (Slot 0)
    uint40 createdAt;      // 5 bytes  (Slot 0)
    uint40 expiresAt;      // 5 bytes  (Slot 0)
    bool claimed;          // 1 byte   (Slot 0)
    // 2 bytes remaining in Slot 0
    bytes32 handleHash;    // 32 bytes (Slot 1)
    uint256 amount;        // 32 bytes (Slot 2)
    address claimedBy;     // 20 bytes (Slot 3)
}

uint256 public nextTipId;
address public owner;
address public claimSigner;
uint256 public constant MIN_TIP = 0.01 ether;
uint256 public constant TIP_DURATION = 7 days;
uint256 public constant MAX_VOUCHER_TTL = 10 minutes;

bytes32 public constant TIP_CLAIM_TYPEHASH = keccak256(
    "TipClaim(uint256 tipId,address recipient,uint256 deadline)"
);

mapping(uint256 => Tip) public tips;
```

### Function Signatures
```solidity
function createTip(bytes32 handleHash) external payable returns (uint256 tipId);
function claim(uint256 tipId, address recipient, uint256 deadline, bytes calldata signature) external;
function refund(uint256 tipId) external;
function setClaimSigner(address newSigner) external;
function getTip(uint256 tipId) external view returns (Tip memory);
```

### Events
```solidity
event TipCreated(uint256 indexed tipId, address indexed sender, bytes32 indexed handleHash, uint256 amount, uint256 expiresAt);
event TipClaimed(uint256 indexed tipId, address indexed recipient, uint256 amount);
event TipRefunded(uint256 indexed tipId, address indexed sender, uint256 amount);
event ClaimSignerUpdated(address indexed oldSigner, address indexed newSigner);
```

### Custom Errors
```solidity
error InvalidAmount();
error InvalidHandleHash();
error TipNotFound();
error TipAlreadyClaimed();
error TipExpired();
error TipNotExpired();
error DeadlineExpired();
error DeadlineTooFar();
error InvalidRecipient();
error InvalidSigner();
error TransferFailed();
error Unauthorized();
error ZeroAddress();
```

### Access Control
- `setClaimSigner(address newSigner)`: Restricted to `owner`.
- `refund(uint256 tipId)`: Restricted to `tips[tipId].sender`.
- `claim(...)`: Callable by anyone, but strictly reverts unless `msg.sender == recipient`.

### State Machine Table
| Current State | Transition Trigger | Conditions | Next State | Effects |
| :--- | :--- | :--- | :--- | :--- |
| **Non-existent** | `createTip(handleHash)` | `msg.value >= 0.01 MON`, `handleHash != bytes32(0)` | **Open** | Stores tip, emits `TipCreated`, increments `nextTipId` |
| **Open** | `claim(tipId, recipient, deadline, sig)` | `block.timestamp <= expiresAt`, `block.timestamp <= deadline`, `deadline <= block.timestamp + 10 min`, `msg.sender == recipient`, valid `claimSigner` EIP-712 sig | **Claimed** | `claimed = true`, `claimedBy = recipient`, transfers MON to recipient |
| **Open** | `refund(tipId)` | `block.timestamp > expiresAt`, `msg.sender == sender`, `!claimed` | **Refunded** | `amount = 0`, transfers MON back to sender |
| **Claimed** | Any call | Any | **Terminal** | Always reverts with `TipAlreadyClaimed()` |
| **Refunded** | Any call | Any | **Terminal** | Always reverts with `InvalidAmount()` or `TipNotFound()` |

---

## 5. Claim API Specification (`POST /api/claim`)

### Endpoint Details
- **Path**: `/api/claim`
- **Method**: `POST`
- **Content-Type**: `application/json`

### Request Payload
```json
{
  "tipId": 1,
  "accessToken": "eyJhbGciOi...",
  "identityToken": "eyJhbGciOi..."
}
```
*Note: The request body MUST NOT contain a handle or recipient address.*

### Success Response (`200 OK`)
```json
{
  "recipient": "0x1234567890123456789012345678901234567890",
  "deadline": 1728144600,
  "signature": "0xabcdef..."
}
```

### Validation Order and Error Table
1. **Body Schema Validation**: Ensure `tipId`, `accessToken`, and `identityToken` exist and have valid types.
2. **Access Token Verification**: Call `privy.verifyAuthToken(accessToken)`. Extracts Privy DID.
3. **Identity Resolution**: Call `privy.users().get({ id_token: identityToken })`. If fails, call `privy.getUser(did)`.
4. **X Account Check**: Inspect `linked_accounts`. Locate entry where `type === 'twitter'`. Extract `username`. If missing, reject.
5. **Embedded Wallet Check**: Locate entry where `type === 'wallet'` and `wallet_client_type === 'privy'`. Extract `address`. If missing, reject.
6. **On-Chain Tip Verification**: Query `TipJar.tips(tipId)` via viem RPC.
   - If `createdAt == 0`, tip does not exist.
   - If `claimed == true`, tip already claimed.
   - If `block.timestamp > expiresAt`, tip expired.
7. **Handle Hash Comparison**: Compute `expectedHash = keccak256(abi.encodePacked(HANDLE_SALT, canonicalize(twitterUsername)))`.
   - If `expectedHash != tip.handleHash`, user does not own the tipped handle.
8. **EIP-712 Signing**: Compute `deadline = block.timestamp + 600` (10 minutes). Sign typed data with `CLAIM_SIGNER_PRIVATE_KEY` using viem's `signTypedData`.

| Step | Condition Failed | HTTP Status | Error Code | Client Message |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Missing/malformed JSON fields | 400 | `BAD_REQUEST` | "Invalid request payload format." |
| 2 | Invalid/expired Privy access token | 401 | `UNAUTHORIZED` | "Invalid or expired session token." |
| 3 | User profile lookup fails | 401 | `USER_NOT_FOUND` | "Privy user record could not be loaded." |
| 4 | No linked Twitter account | 403 | `TWITTER_NOT_LINKED` | "An X (Twitter) account must be linked to claim." |
| 5 | No Privy embedded wallet | 403 | `EMBEDDED_WALLET_MISSING` | "Privy embedded wallet not initialized." |
| 6a | Tip not found (`createdAt == 0`) | 404 | `TIP_NOT_FOUND` | "Tip ID does not exist." |
| 6b | Tip already claimed | 409 | `ALREADY_CLAIMED` | "Tip has already been claimed." |
| 6c | Tip expired | 410 | `TIP_EXPIRED` | "Tip has expired and is refundable by sender." |
| 7 | Handle hash mismatch | 403 | `HANDLE_MISMATCH` | "Authenticated X handle does not match tip." |
| 8 | Signing failure / RPC issue | 500 | `INTERNAL_ERROR` | "Failed to generate claim voucher." |

---

## 6. Frontend Specification

### Routes
1. `/` (Send Flow):
   - Form inputs: X handle (e.g. `@alice`), MON amount (minimum 0.01 MON).
   - Action: Queries `POST /api/hash-handle` with `@alice` -> calls `createTip(handleHash)` with connected external/Privy wallet.
   - State: Shows transaction status, Monadscan link, and copyable share link (`https://tipjar.xyz/claim/[id]`).
2. `/claim/[id]` (Claim Flow):
   - Reads `tipId` from route params. Fetches tip status from contract.
   - Action: "Login with X" button via Privy. Upon login, calls `POST /api/claim`.
   - On success: Prompts user to send `claim(tipId, recipient, deadline, sig)` from their embedded wallet.
   - Checks: Evaluates claimer native MON balance; if 0, displays faucet warning banner with direct link (`https://faucet.monad.xyz`).
3. `/me` (Dashboard):
   - Displays tips created by the connected address (filtered via `TipCreated` event logs).
   - Shows status (Pending, Claimed, Expired).
   - Renders "Refund" button for expired, unclaimed tips.

### Component Structure
```text
src/components/
  Navbar.tsx            // Wallet connect button, current chain badge, Privy login/logout
  TipForm.tsx           // Input handle, MON amount, client-side validation, submit
  ClaimCard.tsx         // Dynamic state machine card for /claim/[id]
  TipHistoryTable.tsx   // List of sent tips with refund triggers
  FaucetBanner.tsx      // Low gas alert with direct Monad faucet link
```

### Wallet Signing Responsibilities
- **Sender**: Can use any injected browser wallet (MetaMask, Rabby) or Privy wallet. Signs `createTip` and `refund`.
- **Claimer**: Must sign `claim` strictly from the Privy embedded wallet matching the `recipient` address embedded in the voucher.

---

## 7. Repository Tree

```text
tipjar/
├── foundry.toml                  # Foundry config: network="monad", chain_id=10143, cancun EVM
├── src/
│   └── TipJar.sol               # Core contract with OpenZeppelin EIP712, ECDSA, ReentrancyGuard
├── test/
│   └── TipJar.t.sol             # Exhaustive test suite covering all security assertions
├── script/
│   └── Deploy.s.sol             # Deployment script for Monad Testnet
├── app/
│   ├── package.json             # Next.js 15, viem, @privy-io/react-auth, @privy-io/node, tailwindcss
│   ├── tsconfig.json            # Strict TypeScript configuration
│   ├── tailwind.config.js       # Styling configuration
│   ├── .env.example             # Documented template for frontend and API secrets
│   └── src/
│       ├── app/
│       │   ├── layout.tsx       # Root layout injecting PrivyProvider configured for Monad Testnet
│       │   ├── page.tsx         # / route (send tip form)
│       │   ├── me/
│       │   │   └── page.tsx     # /me route (sender tips history and refund actions)
│       │   ├── claim/
│       │   │   └── [id]/
│       │   │       └── page.tsx # /claim/[id] route (X login, voucher retrieval, on-chain claim)
│       │   └── api/
│       │       ├── hash-handle/
│       │       │   └── route.ts # POST /api/hash-handle (returns salted hash for handle)
│       │       └── claim/
│       │           └── route.ts # POST /api/claim (validates Privy tokens and returns EIP-712 voucher)
│       ├── components/
│       │   ├── Navbar.tsx       # Header with network status and auth controls
│       │   ├── TipForm.tsx      # Sender input and transaction dispatch
│       │   ├── ClaimCard.tsx    # Claim state transitions and execution
│       │   └── FaucetBanner.tsx # Gas warning banner linking to Monad faucet
│       └── lib/
│           ├── chain.ts         # Monad Testnet viem chain definition (ID: 10143)
│           ├── contract.ts      # Contract ABI and deployed address definitions
│           └── signer.ts        # Server-only EIP-712 signing logic using private key
└── README.md                    # Setup guide, runbook, contract addresses, and verification
```

---

## 8. Environment Variables

| Variable | Location | Scope | Description |
| :--- | :--- | :--- | :--- |
| `MONAD_RPC_URL` | Foundry / Server | Private | Monad Testnet RPC endpoint (`https://testnet-rpc.monad.xyz`) |
| `DEPLOYER_PRIVATE_KEY` | Foundry (`.env`) | Secret | Private key used solely to deploy `TipJar.sol` via `Deploy.s.sol` |
| `CLAIM_SIGNER_PRIVATE_KEY`| Server (`app/.env`)| Secret | Private key used in `/api/claim` to sign EIP-712 claim vouchers |
| `HANDLE_SALT` | Server (`app/.env`)| Secret | Random 32-byte hex salt used to hash X handles |
| `PRIVY_APP_ID` | Client & Server | Public | Privy Application ID for `@privy-io/react-auth` and `@privy-io/node` |
| `PRIVY_APP_SECRET` | Server (`app/.env`)| Secret | Privy Application Secret used for backend user identity lookups |
| `NEXT_PUBLIC_CONTRACT_ADDRESS`| Client (`app/.env`)| Public | Deployed `TipJar` contract address on Monad Testnet |

---

## 9. Threat Model

| Threat / Attack Vector | Severity | Mitigation | Verification Test |
| :--- | :--- | :--- | :--- |
| **Mempool Front-Running** (Searcher steals voucher and calls `claim`) | Critical | Contract enforces `require(msg.sender == recipient, InvalidRecipient())`. | `test_Claim_RevertIf_CallerNotRecipient()` |
| **Cross-Tip Voucher Replay** (Reuse voucher for Tip #1 to claim Tip #2) | Critical | EIP-712 struct includes `tipId`. Contract verifies hash against target tip. | `test_Claim_RevertIf_ReplayingVoucherDifferentTip()` |
| **Cross-Contract / Cross-Chain Replay** (Reuse voucher on fork or redeploy) | High | EIP-712 domain separator includes `block.chainid` and `verifyingContract`. | `test_Claim_RevertIf_WrongDomainSeparator()` |
| **Double Claim Race** (Claiming twice concurrently) | High | State update (`claimed = true`) occurs before native MON transfer. Reentrancy guard enabled. | `test_Claim_RevertIf_AlreadyClaimed()` |
| **Expired Voucher Stockpiling** | Medium | Contract checks `block.timestamp <= deadline`; API issues max 10 min deadline. | `test_Claim_RevertIf_DeadlineExpired()` |
| **Unauthorized Refund** (Attacker attempts refund on active tip) | High | `refund()` requires `msg.sender == sender` AND `block.timestamp > expiresAt`. | `test_Refund_RevertIf_BeforeExpiry()` & `test_Refund_RevertIf_NotSender()` |
| **Handle Dictionary Enumeration** | Medium | `HANDLE_SALT` kept on server; rate limiting applied to `POST /api/hash-handle`. | Integration rate-limit verification |
| **Client Identity Spoofing** (Client injects target handle in body) | Critical | API route ignores body handles; extracts username strictly via verified Privy token. | `test_ClaimAPI_IgnoresBodyHandle()` |
| **Signer Key Compromise** | Critical | Contract implements `setClaimSigner(address newSigner)` owner function. | `test_SetClaimSigner_OnlyOwner()` |

---

## 10. Test Plan

### Foundry Unit Tests (`test/TipJar.t.sol`)
1. `test_CreateTip_Success()`: Locks >= 0.01 MON, stores struct, emits `TipCreated`.
2. `test_CreateTip_RevertIf_BelowMinAmount()`: Send 0.009 MON -> reverts with `InvalidAmount()`.
3. `test_CreateTip_RevertIf_ZeroHash()`: Hash is `bytes32(0)` -> reverts with `InvalidHandleHash()`.
4. `test_Claim_Success()`: Valid voucher, `msg.sender == recipient`, transfers MON, marks claimed.
5. `test_Claim_RevertIf_DeadlineExpired()`: `block.timestamp > deadline` -> reverts with `DeadlineExpired()`.
6. `test_Claim_RevertIf_DeadlineTooFar()`: `deadline > block.timestamp + 10 min` -> reverts with `DeadlineTooFar()`.
7. `test_Claim_RevertIf_CallerNotRecipient()`: `msg.sender != recipient` -> reverts with `InvalidRecipient()`.
8. `test_Claim_RevertIf_InvalidSigner()`: Signature from rogue key -> reverts with `InvalidSigner()`.
9. `test_Claim_RevertIf_TipExpired()`: `block.timestamp > expiresAt` -> reverts with `TipExpired()`.
10. `test_Refund_Success()`: `block.timestamp > 7 days`, `msg.sender == sender` -> transfers full MON.
11. `test_Refund_RevertIf_BeforeExpiry()`: Call before 7 days -> reverts with `TipNotExpired()`.
12. `test_Refund_RevertIf_NotSender()`: Non-sender calls `refund` -> reverts with `Unauthorized()`.
13. `test_Refund_RevertIf_AlreadyClaimed()`: Call `refund` after claim -> reverts with `TipAlreadyClaimed()`.
14. `test_Reentrancy_Claim()`: Mock recipient re-enters `claim()` -> reverts via `ReentrancyGuard`.
15. `test_SetClaimSigner_AccessControl()`: Non-owner calls -> reverts with `Unauthorized()`; owner rotates signer -> invalidates old signatures.

### End-to-End Demo Script (`script/test-e2e.sh`)
```bash
# 1. Hashes handle '@alice' via API
# 2. Creates tip on-chain for 0.01 MON
# 3. Requests claim voucher from /api/claim with simulated Alice tokens -> returns valid EIP-712 sig
# 4. Executes claim() on-chain -> verifies balance increment
# 5. Attempts secondary claim with simulated Bob tokens -> rejected with 403 HANDLE_MISMATCH
```

---

## 11. Demo Runbook

1. **Step 1: Funding**: Open browser with primary wallet. Connect to Monad Testnet and confirm balance >= 0.05 MON via `https://faucet.monad.xyz`.
2. **Step 2: Tip Creation**:
   - Navigate to `http://localhost:3000/`.
   - Enter X handle of demo recipient (e.g. `@metropolis_tester`) and amount `0.02`.
   - Click "Send Tip". Confirm MetaMask transaction.
   - UI displays "Tip Created! Tip ID: 1" and Monadscan transaction link.
3. **Step 3: Successful Claim (Incognito Window)**:
   - Open Incognito browser window. Navigate to `http://localhost:3000/claim/1`.
   - Click "Login with X". Authenticate as `@metropolis_tester`.
   - Privy creates embedded wallet.
   - If embedded wallet has 0 MON, user clicks "Fund with Faucet" banner link to grab gas MON.
   - Click "Claim 0.02 MON". Embedded wallet prompts signature/transaction execution.
   - Success state displays confetti and Monadscan link showing 0.02 MON transfer.
4. **Step 4: Unauthorized Negative Test**:
   - Open second Incognito window. Navigate to `http://localhost:3000/claim/1`.
   - Click "Login with X". Authenticate as `@other_account`.
   - UI displays banner: `Error 403: Authenticated handle @other_account does not match tip commitment`. Claim button is disabled.

---

## 12. Build Order

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Phase 0 │ ──> │ Phase 1 │ ──> │ Phase 2 │ ──> │ Phase 3 │ ──> │ Phase 4 │ ──> │ Phase 5 │
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
 Toolchain       Contracts        Deploy          Backend         Frontend        Demo &
 Validation      & Tests          Script         Claim API         Pages          README
```

- **Phase 0: Toolchain Validation**
  - Verify Foundry >= v1.8.0, check Monad RPC connection, verify `@privy-io/node` imports.
  - *Checkpoint*: `forge --version` outputs >= 1.8.0; `cast block-number --rpc-url https://testnet-rpc.monad.xyz` returns current block.
- **Phase 1: Contract & Unit Tests**
  - Implement `src/TipJar.sol` and `test/TipJar.t.sol`.
  - *Checkpoint*: `forge test --network monad -vv` returns 100% green tests.
- **Phase 2: Deployment Script**
  - Implement `script/Deploy.s.sol`. Deploy to Monad Testnet (`10143`).
  - *Checkpoint*: Contract deployed address visible on `testnet.monadscan.com`; `cast call <ADDRESS> "claimSigner()"` returns expected signer.
- **Phase 3: Backend API**
  - Implement `/api/hash-handle` and `/api/claim` with `src/lib/signer.ts`.
  - *Checkpoint*: Node test script executes successful EIP-712 signature generation and verifies rejection of invalid tokens and mismatched handles.
- **Phase 4: Frontend UI**
  - Implement Next.js pages (`/`, `/claim/[id]`, `/me`) with `@privy-io/react-auth`.
  - *Checkpoint*: `npm run build` succeeds with zero TypeScript or lint errors.
- **Phase 5: Demo & Documentation**
  - Write `README.md` and complete full runbook walkthrough on Monad Testnet.
  - *Checkpoint*: Full end-to-end video recording completed with verified Monadscan transaction URLs.

---

## 13. Open Risks and Fallbacks

1. **Risk: Claimer embedded wallet has 0 MON and cannot pay claim gas.**
   - *Impact*: High. The demo blocks if the claimer cannot execute the transaction.
   - *Mitigation/Fallback*: Display an inline warning banner on `/claim/[id]` when the embedded wallet balance < 0.005 MON with a direct pre-filled link to `https://faucet.monad.xyz`. As emergency hackathon fallback, sender can fund the embedded wallet address directly with a tiny faucet transfer.
2. **Risk: Privy X OAuth rate-limits or fails during judging.**
   - *Impact*: High. Users cannot log in with X.
   - *Mitigation/Fallback*: Ensure Privy App Credentials and Twitter Developer App status are in "Elevated" or production tier with callback URLs properly configured (`http://localhost:3000`).
3. **Risk: Monad Testnet RPC throttling or temporary instability.**
   - *Impact*: Medium. RPC calls fail or experience high latency.
   - *Mitigation/Fallback*: Configure secondary fallback RPCs if available or increase timeout retry intervals in viem client definitions (`retryCount: 3, retryDelay: 1000`).
