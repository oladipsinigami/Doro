export type ClaimRequest = {
  tipId: bigint;
  accessToken: string;
  identityToken?: string;
};

/**
 * Claim request for the external-wallet path. `recipient` is the wallet the
 * caller will broadcast from; it is NOT trusted until its ownership signature
 * is verified by the server.
 */
export type WalletClaimRequest = ClaimRequest & {
  recipient: `0x${string}`;
  recipientSignature: `0x${string}`;
};

export type ClaimRequestResult =
  | { ok: true; value: ClaimRequest }
  | { ok: false; error: "BAD_REQUEST" };

export type WalletClaimRequestResult =
  | { ok: true; value: WalletClaimRequest }
  | { ok: false; error: "BAD_REQUEST" };

const UINT256_MAX =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n;

/**
 * Allowlisted extraction of the claim request body.
 *
 * Identity fields (handle, recipient, deadline, signature) are deliberately
 * absent from the returned type and from this function entirely, so a client
 * that injects them cannot reach the signing path. See ARCHITECTURE.md section
 * 9, "Client Identity Spoofing".
 *
 * Internal: the only claim route is external-wallet, and it goes through
 * `extractWalletClaimRequest`, which builds on this. Exported for its own tests.
 */
export function extractClaimRequest(body: unknown): ClaimRequestResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "BAD_REQUEST" };
  }

  const record = body as Record<string, unknown>;

  const { tipId, accessToken, identityToken } = record;

  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    return { ok: false, error: "BAD_REQUEST" };
  }

  if (typeof identityToken !== "undefined" && typeof identityToken !== "string") {
    return { ok: false, error: "BAD_REQUEST" };
  }

  const parsedTipId = parseTipId(tipId);
  if (parsedTipId === null) {
    return { ok: false, error: "BAD_REQUEST" };
  }

  return {
    ok: true,
    value: {
      tipId: parsedTipId,
      accessToken,
      ...(typeof identityToken === "string" ? { identityToken } : {}),
    },
  };
}

function parseTipId(raw: unknown): bigint | null {
  let value: bigint;

  if (typeof raw === "bigint") {
    value = raw;
  } else if (typeof raw === "number") {
    if (!Number.isInteger(raw)) return null;
    value = BigInt(raw);
  } else if (typeof raw === "string") {
    if (!/^\d+$/.test(raw.trim())) return null;
    try {
      value = BigInt(raw.trim());
    } catch {
      return null;
    }
  } else {
    return null;
  }

  if (value < 0n || value > UINT256_MAX) return null;
  return value;
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;

/**
 * Extracts the external-wallet claim request.
 *
 * `recipient` and `recipientSignature` are allowlisted here but remain
 * UNTRUSTED until the server recovers the signature and confirms it matches
 * `recipient`. Identity fields such as handle are still not accepted.
 */
export function extractWalletClaimRequest(
  body: unknown
): WalletClaimRequestResult {
  const base = extractClaimRequest(body);
  if (!base.ok) return base;

  const record = body as Record<string, unknown>;
  const recipient = record.recipient;
  const recipientSignature = record.recipientSignature;

  if (typeof recipient !== "string" || !ADDRESS_PATTERN.test(recipient)) {
    return { ok: false, error: "BAD_REQUEST" };
  }
  if (
    typeof recipientSignature !== "string" ||
    !SIGNATURE_PATTERN.test(recipientSignature)
  ) {
    return { ok: false, error: "BAD_REQUEST" };
  }

  return {
    ok: true,
    value: {
      ...base.value,
      recipient: recipient as `0x${string}`,
      recipientSignature: recipientSignature as `0x${string}`,
    },
  };
}