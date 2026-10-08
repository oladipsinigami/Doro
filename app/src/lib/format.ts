import { formatEther } from "viem";

/**
 * Present a wei amount as MON. `wei` arrives as a string because JSON has no
 * BigInt, so it is converted rather than passed to `formatEther` directly.
 *
 * Trims trailing zeros so a gift reads "0.02 MON" rather than
 * "0.020000000000000000 MON".
 */
export function formatMon(wei: string | bigint): string {
  try {
    const value = typeof wei === "bigint" ? wei : BigInt(wei);
    const formatted = formatEther(value);
    // Keep small gifts precise, but drop noise on round ones.
    const trimmed = formatted.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
    return `${trimmed} MON`;
  } catch {
    return "unknown";
  }
}

/** "0x1234…abcd" for a wallet address. */
export function shortAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return "unknown";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}