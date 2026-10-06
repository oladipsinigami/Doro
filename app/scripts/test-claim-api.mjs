import { recoverTypedDataAddress, encodePacked, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function runTests() {
  console.log("=== Running Phase 3 Claim API & Cryptographic Signer Verification ===\n");

  const testSignerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const signerAccount = privateKeyToAccount(testSignerKey);
  const testContractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const testSalt = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  console.log("Signer Public Address:", signerAccount.address);

  // Test 1: Canonicalization & Handle Hashing
  console.log("\n[Test 1] Testing Handle Canonicalization & Hash...");
  const rawHandle = "  @Metropolis_Builder  ";
  const cleanHandle = rawHandle.trim().replace(/^@/, "").toLowerCase();
  if (cleanHandle !== "metropolis_builder") {
    throw new Error(`Canonicalization failed: expected 'metropolis_builder', got '${cleanHandle}'`);
  }

  const handleHash = keccak256(encodePacked(["bytes32", "string"], [testSalt, cleanHandle]));
  console.log(`✓ Clean Handle: '${cleanHandle}' -> Hash: ${handleHash}`);

  // Test 2: EIP-712 Voucher Generation & Cryptographic Recovery
  console.log("\n[Test 2] Testing EIP-712 Voucher Generation & Recovery...");
  const tipId = 1n;
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  const domain = {
    name: "TipJar",
    version: "1",
    chainId: 10143n,
    verifyingContract: testContractAddress,
  };

  const types = {
    TipClaim: [
      { name: "tipId", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const signature = await signerAccount.signTypedData({
    domain,
    types,
    primaryType: "TipClaim",
    message: {
      tipId,
      recipient,
      deadline,
    },
  });

  console.log("Generated Voucher Signature:", signature);

  const recoveredAddress = await recoverTypedDataAddress({
    domain,
    types,
    primaryType: "TipClaim",
    message: {
      tipId,
      recipient,
      deadline,
    },
    signature,
  });

  if (recoveredAddress.toLowerCase() !== signerAccount.address.toLowerCase()) {
    throw new Error(
      `Signature recovery failed! Expected ${signerAccount.address}, got ${recoveredAddress}`
    );
  }
  console.log("✓ Recovered Address matches Claim Signer:", recoveredAddress);

  // Test 3: Cross-Tip / Tampering Resistance
  console.log("\n[Test 3] Testing Tamper-Proof Assertion (Modified Tip ID)...");
  const tamperedAddress = await recoverTypedDataAddress({
    domain,
    types,
    primaryType: "TipClaim",
    message: {
      tipId: 2n, // Attacker alters tipId
      recipient,
      deadline,
    },
    signature,
  });

  if (tamperedAddress.toLowerCase() === signerAccount.address.toLowerCase()) {
    throw new Error("Tampered tipId should NOT recover to valid claim signer!");
  }
  console.log("✓ Tampered tipId recovers to invalid address (attack neutralized)");

  // Test 4: Cross-Chain Domain Separator Resistance
  console.log("\n[Test 4] Testing Cross-Chain Replay Resistance (Chain ID 143)...");
  const mainnetDomain = { ...domain, chainId: 143n };
  const crossChainAddress = await recoverTypedDataAddress({
    domain: mainnetDomain,
    types,
    primaryType: "TipClaim",
    message: {
      tipId,
      recipient,
      deadline,
    },
    signature,
  });

  if (crossChainAddress.toLowerCase() === signerAccount.address.toLowerCase()) {
    throw new Error("Cross-chain replay should NOT recover to valid claim signer!");
  }
  console.log("✓ Cross-chain replay alters digest and recovers to invalid address");

  // Test 5: Route Logic Checkpoint — Token Validation & Mismatch Rejection
  console.log("\n[Test 5] Simulating Route Handler Validation Sequences...");
  
  // Scenario 5a: Missing / Invalid token
  function simulateRoute({ accessToken, twitterUsername, onChainHandleHash, targetHandle }) {
    if (!accessToken || accessToken === "invalid_jwt") {
      return { status: 401, error: "UNAUTHORIZED", message: "Invalid or expired access token." };
    }
    const cleanUser = twitterUsername.trim().replace(/^@/, "").toLowerCase();
    const computedHash = keccak256(encodePacked(["bytes32", "string"], [testSalt, cleanUser]));
    if (computedHash.toLowerCase() !== onChainHandleHash.toLowerCase()) {
      return {
        status: 403,
        error: "HANDLE_MISMATCH",
        message: `Authenticated X account @${twitterUsername} does not match the tip recipient.`,
      };
    }
    return {
      status: 200,
      recipient,
      deadline: Number(deadline),
      signature,
    };
  }

  // 1. Invalid token test
  const resInvalid = simulateRoute({
    accessToken: "invalid_jwt",
    twitterUsername: "attacker_handle",
    onChainHandleHash: handleHash,
    targetHandle: "metropolis_builder",
  });
  if (resInvalid.status !== 401 || resInvalid.error !== "UNAUTHORIZED") {
    throw new Error("Route failed to reject invalid token!");
  }
  console.log("✓ Route rejects invalid token with 401 UNAUTHORIZED");

  // 2. Valid token for wrong handle
  const resWrongHandle = simulateRoute({
    accessToken: "valid_privy_token_user_bob",
    twitterUsername: "bob_wrong_guy",
    onChainHandleHash: handleHash,
    targetHandle: "metropolis_builder",
  });
  if (resWrongHandle.status !== 403 || resWrongHandle.error !== "HANDLE_MISMATCH") {
    throw new Error("Route failed to reject wrong handle mismatch!");
  }
  console.log("✓ Route rejects wrong handle with 403 HANDLE_MISMATCH");

  // 3. Valid token for right handle
  const resRightHandle = simulateRoute({
    accessToken: "valid_privy_token_user_alice",
    twitterUsername: "  @Metropolis_Builder  ",
    onChainHandleHash: handleHash,
    targetHandle: "metropolis_builder",
  });
  if (resRightHandle.status !== 200 || !resRightHandle.signature) {
    throw new Error("Route failed to approve valid handle!");
  }
  console.log("✓ Route approves matching handle with 200 OK and valid EIP-712 voucher");

  console.log("\n=== ALL CRYPTOGRAPHIC & API SIGNING ASSERTIONS PASSED ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
