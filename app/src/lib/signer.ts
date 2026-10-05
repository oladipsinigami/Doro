import "server-only";
import { encodePacked, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "./chain";
import { TIPJAR_ADDRESS, TIP_CLAIM_TYPES } from "./tipjar";

export function canonicalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

export function hashHandle(handle: string, explicitSalt?: string): `0x${string}` {
  const salt = (explicitSalt || process.env.HANDLE_SALT) as `0x${string}`;
  if (!salt) {
    throw new Error("HANDLE_SALT environment variable is not configured.");
  }
  const clean = canonicalizeHandle(handle);
  return keccak256(encodePacked(["bytes32", "string"], [salt, clean]));
}

export async function signTipClaimVoucher(
  tipId: bigint,
  recipient: `0x${string}`,
  deadline: bigint
): Promise<`0x${string}`> {
  const privateKey = process.env.CLAIM_SIGNER_PRIVATE_KEY as `0x${string}`;
  if (!privateKey) {
    throw new Error("CLAIM_SIGNER_PRIVATE_KEY environment variable is not configured.");
  }

  const account = privateKeyToAccount(privateKey);

  const domain = {
    name: "TipJar",
    version: "1",
    chainId: BigInt(monadTestnet.id),
    verifyingContract: TIPJAR_ADDRESS,
  } as const;

  const signature = await account.signTypedData({
    domain,
    types: TIP_CLAIM_TYPES,
    primaryType: "TipClaim",
    message: {
      tipId,
      recipient,
      deadline,
    },
  });

  return signature;
}
