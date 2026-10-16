import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format USDC base units (6 decimals) as a display string. */
export function formatUsdc(
  amount: bigint | string | number | null | undefined,
  decimals = 6,
  maxFractionDigits = 6
): string {
  if (amount === null || amount === undefined) return "—";
  const a = typeof amount === "bigint" ? amount : BigInt(amount);
  const negative = a < 0n;
  const abs = negative ? -a : a;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  let fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFractionDigits);
  fracStr = fracStr.replace(/0+$/, "");
  const wholeStr = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}${wholeStr}${fracStr ? `.${fracStr}` : ""}`;
}

/** Parse a USDC display string to base units. */
export function parseUsdc(amount: string, decimals = 6): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const wholeB = BigInt(whole || "0");
  const fracB = BigInt(frac.padEnd(decimals, "0").slice(0, decimals) || "0");
  return wholeB * 10n ** BigInt(decimals) + fracB;
}

export function shortAddress(addr: string, chars = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusBadge(status: string) {
  switch (status) {
    case "confirmed":
      return "badge-success";
    case "pending":
    case "submitted":
    case "settling":
      return "badge-pending";
    case "failed":
      return "badge-failed";
    default:
      return "badge-neutral";
  }
}
