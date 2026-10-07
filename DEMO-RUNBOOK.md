# Demo Runbook — Doro

Verified against the live app and Monad Testnet on the evening of the hackathon
demo. Every status below was checked with a command, not assumed.

---

## Pre-flight (do this 15 minutes before)

```bash
cd app
npm test                      # expect 142 passed
rm -rf .next                  # clears stale cache, frees ~8 GB
npm run dev                   # leave running
```

Then open `http://localhost:3000` and confirm three things render: the send form,
the courier picker (four portraits), and the navbar.

**Critical:** do not run `npm run build` while `npm run dev` is serving. They
share `.next` and the build corrupts the running server. This has broken `/me`
twice during development.

---

## Contract facts for your talking points

| | |
| --- | --- |
| Address | `0xa7a9ACAc332C398B61f7459215Fd4f5522686b88` |
| Chain | Monad Testnet, `10143` |
| Owner | `0xdB99D8C6b401cF97eaE6c835345938edF5299d25` |
| Claim signer | `0xAfA05531E7c8850B41da7bC441099F3b29671b87` |
| Code size | 8,726 bytes |
| Tests | 30 Foundry + 142 application, all green |

---

## Live gift inventory

Use this to narrate. Nine gifts have been created; four are still claimable.

```
#0   0.1 MON   PENDING   5.6d left
#1   0.1 MON   claimed → 0x05624DAF…
#2   0.5 MON   claimed → 0x8eEC1bfc…   (sent by a different wallet)
#3   0.1 MON   claimed → 0xb28678f3…
#4   0.1 MON   PENDING   6.6d left
#5   0.5 MON   PENDING   6.8d left
#6   0.1 MON   PENDING   6.9d left
#7   0.1 MON   PENDING   6.9d left
#8   0.05 MON  claimed → 0x5fA4B4cD…
```

Escrow currently holds **0.9 MON**.

`/claim/4` is the safest link to demo with — it is pending, worth 0.1 MON, and
has over six days left.

---

## The demo, step by step

### 1. Send (30 seconds)

1. Open `localhost:3000`
2. Type `@oladipsingami` — a picture and name appear under the field
3. Enter `0.05` MON
4. Optional: a note, a courier, and your own handle in **From**
5. Connect your wallet, confirm the transaction

Say: *"Locked on-chain against a salted hash of an X handle. Not an address —
because they don't have a wallet yet."*

### 2. Claim — the part judges care about

1. **Incognito window** (or a different browser). Open the `/claim/N` link
2. "Sign in with X"
3. Button becomes **"Connect a wallet to claim"** → connect MetaMask
4. Button becomes **"Claim 0.05 MON"**
5. Two wallet prompts: the ownership check, then the claim
6. Success card with the transaction hash

Say: *"X proves who they are. Their own wallet receives the money and pays the
gas. No embedded wallet, no funding step, nothing to install."*

### 3. Wrong account (30 seconds — this is the differentiator)

1. Sign out via **"Sign out and use a different X account"**
2. Sign in with a different X account
3. The app auto-routes: *"Not your gift"* → either your waiting gift, or
   *"No gifts are waiting on @you"*

Say: *"The handle is compared server-side against an on-chain commitment. A
gifted stranger cannot claim, and they never even see a claim button."*

### 4. The same link, twice (optional)

Open the same `/claim/N` link again after claiming. It reads **"Already claimed"**
with the claimer's address. Shows the state machine honestly.

---

## Things that will break, and what to do

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Monad didn't answer" | RPC blip | Click **Try again** |
| Page shows a 404 | Dev server was clobbered by a build | Stop server, `rm -rf .next`, restart |
| Faucet says 429 | Monad rate-limits the faucet | Wait, or fund from another testnet wallet |
| X login does nothing | Privy App ID is not 25 characters | Check `.env.local`, restart |
| Claim reverts `InvalidSigner` | Server signer ≠ contract signer | `setClaimSigner` then wait for the timelock |
| Wallet has no MON | Recipient needs gas | Faucet the connected wallet |

---

## Honest limitations to state if asked

These are real and worth saying before a judge finds them.

**The handle binding is server-side only.** `claim()` never reads `handleHash` on
chain. Severity is capped by `msg.sender == recipient`: a compromised signer
causes griefing, not theft. Recorded as SD-05 in `SECURITY-DEBT.md`.

**A sender cannot notify you.** Gifts are invisible until you open the app and
look. That is what `/api/my-gifts` works around — discovery, not notification.

**Sender names are self-reported.** No public service maps a wallet address to an
X handle, so a sender can type anyone's name. The card says so.

**Rate limiting is process-local.** Correct for one instance, undercounts behind
more than one. SD-06.

**Embedded wallets require `https://`.** Outside localhost they fail silently.
Not an issue for a localhost demo.

---

## Useful commands

```bash
# current contract state
cast call 0xa7a9ACAc332C398B61f7459215Fd4f5522686b88 "nextTipId()(uint256)" \
  --rpc-url https://testnet-rpc.monad.xyz

# a single gift
cast call 0xa7a9ACAc332C398B61f7459215Fd4f5522686b88 \
  "getTip(uint256)((address,uint40,uint40,bool,bytes32,uint256,address))" 4 \
  --rpc-url https://testnet-rpc.monad.xyz

# escrow balance
cast balance 0xa7a9ACAc332C398B61f7459215Fd4f5522686b88 \
  --rpc-url https://testnet-rpc.monad.xyz
```

**If `cast` fails with a DNS error but the browser works:** Foundry's resolver is
failing on this network while curl succeeds. Use the browser, or run the call
through `node` with viem. This is a local resolver quirk, not a chain problem.

---

## Before you present

- [ ] `npm test` green
- [ ] Fresh gift created, note its ID
- [ ] That gift's `/claim/N` opens and renders
- [ ] Connected wallet has testnet MON for gas
- [ ] Incognito window ready for the claim
- [ ] Second X account available for the wrong-account demo

Nothing in this repository is committed. 20+ modified files and 20+ untracked.
Commit before you present, or the demo depends entirely on this machine's state.