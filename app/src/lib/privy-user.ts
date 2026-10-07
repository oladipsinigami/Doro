/**
 * Resolves the recipient's Privy embedded wallet address from a Privy user
 * record, tolerating the shape differences across Privy versions and both the
 * frontend `User` object and the REST API response.
 *
 * Embedded wallets live on `user.wallets` in Privy v3, NOT in `linkedAccounts`
 * (which holds only external/linked accounts such as Twitter). Older builds and
 * some REST responses do surface them as linked accounts, so both are checked.
 *
 * Returns null rather than a wrong address: a mismatched recipient would make
 * every claim revert with InvalidRecipient.
 */

export type PrivyUserLike = {
  wallets?: unknown;
  linkedAccounts?: unknown;
  linked_accounts?: unknown;
  twitter?: { username?: string } | null;
};

function isAddressLike(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function addressFrom(candidate: any): string | null {
  if (!candidate || typeof candidate !== "object") return null;

  // Embedded wallets are identified by walletClientType 'privy'.
  const clientType = candidate.walletClientType ?? candidate.wallet_client_type;
  if (clientType !== "privy") return null;

  if (isAddressLike(candidate.address)) return candidate.address;

  return null;
}

export function findEmbeddedWalletAddress(user: PrivyUserLike | null | undefined): string | null {
  if (!user) return null;

  const pools: unknown[] = [
    user.wallets,
    user.linkedAccounts,
    user.linked_accounts,
  ];

  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const entry of pool) {
      const address = addressFrom(entry);
      if (address) return address;
    }
  }

  return null;
}

/**
 * Extracts the linked X (Twitter) handle. Checks both camelCase and snake_case
 * containers, and the linked-account type has been observed as both 'twitter'
 * and 'twitter_oauth'.
 */
export function findTwitterUsername(user: PrivyUserLike | null | undefined): string | null {
  if (!user) return null;

  const pools: any[] = [user.linkedAccounts, user.linked_accounts];

  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    for (const entry of pool) {
      const type = entry?.type;
      if (type !== "twitter" && type !== "twitter_oauth") continue;
      const username = entry?.username ?? entry?.name;
      if (typeof username === "string" && username.length > 0) return username;
    }
  }

  const direct = user.twitter?.username;
  return typeof direct === "string" && direct.length > 0 ? direct : null;
}
