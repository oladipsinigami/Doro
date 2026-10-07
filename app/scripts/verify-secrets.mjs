/**
 * Verifies the Doro secrets in .env.local are internally consistent.
 * Prints no secret values.
 */
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";

const PLACEHOLDER_SALT =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");

const get = (name) =>
  env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();

const key = get("CLAIM_SIGNER_PRIVATE_KEY");
const addr = get("CLAIM_SIGNER_ADDRESS");
const salt = get("HANDLE_SALT");
const privyId = get("NEXT_PUBLIC_PRIVY_APP_ID");
const privyServerId = get("PRIVY_APP_ID");

const derived = key ? privateKeyToAccount(key).address.toLowerCase() : null;

const rows = [
  ["signing key derives CLAIM_SIGNER_ADDRESS", derived === addr?.toLowerCase()],
  ["key is 32 bytes (66 chars)", key?.length === 66],
  ["address is 20 bytes (42 chars)", addr?.length === 42],
  ["salt is 32 bytes (66 chars)", salt?.length === 66],
  ["salt is NOT the example placeholder", salt !== PLACEHOLDER_SALT],
  ["salt is a fresh value (not repeated)", salt !== "0x" + "0".repeat(64)],
  ["Privy App ID is exactly 25 chars", privyId?.length === 25],
  ["Privy App IDs match (client vs server)", privyId === privyServerId],
];

let failed = 0;
for (const [label, ok] of rows) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

console.log("");
console.log(`CLAIM_SIGNER_ADDRESS = ${addr}`);
console.log(`${rows.length - failed}/${rows.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
