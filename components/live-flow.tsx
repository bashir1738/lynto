"use client";

import useSWR from "swr";
import { cn, formatUsdc } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Step {
  id: string;
  title: string;
  description: string;
  value: (s: any) => string;
  sub: (s: any) => string;
  active: (s: any) => boolean;
}

const steps: Step[] = [
  {
    id: "deposit",
    title: "1 · Deposit",
    description: "Owner funds agent prepaid balance in USDC",
    value: (s) => `${formatUsdc(s.totals.totalDeposited)} USDC`,
    sub: (s) => `${s.totals.agentCount} funded agent(s)`,
    active: (s) => BigInt(s.totals.totalDeposited || "0") > 0n,
  },
  {
    id: "meter",
    title: "2 · Meter",
    description: "Paid API calls accrued offchain (no per-call tx)",
    value: (s) => s.totals.successfulCalls.toLocaleString(),
    sub: (s) =>
      `${s.totals.accruedCalls} awaiting settle · ${formatUsdc(s.totals.accruedUnsettled)} USDC`,
    active: (s) => s.totals.successfulCalls > 0,
  },
  {
    id: "reserve",
    title: "3 · Reserve",
    description: "Accrued usage locked onchain against withdrawals",
    value: (s) => `${formatUsdc(s.totals.reservedOnchain)} USDC`,
    sub: (s) =>
      BigInt(s.totals.reservedOnchain || "0") > 0n
        ? "Held against accrued usage"
        : BigInt(s.totals.totalSettled || "0") > 0n
          ? "Cleared after settlement"
          : "Operator syncs reserved funds",
    active: (s) =>
      BigInt(s.totals.reservedOnchain || "0") > 0n ||
      BigInt(s.totals.totalSettled || "0") > 0n,
  },
  {
    id: "settle",
    title: "4 · Settle",
    description: "One batch transaction pays the provider",
    value: (s) => `${formatUsdc(s.totals.totalSettled)} USDC`,
    sub: (s) =>
      `${s.recentSettlements?.filter((x: any) => x.status === "confirmed").length ?? 0} confirmed batch(es)`,
    active: (s) => BigInt(s.totals.totalSettled || "0") > 0n,
  },
  {
    id: "provider",
    title: "5 · Provider",
    description: "USDC received on Arc, linked to explorer",
    value: (s) => `${formatUsdc(s.totals.totalSettled)} USDC`,
    sub: (s) => {
      const latest = s.recentSettlements?.find((x: any) => x.txHash);
      return latest?.txHash
        ? `Latest tx ${latest.txHash.slice(0, 10)}…`
        : "Awaiting first settlement";
    },
    active: (s) =>
      s.recentSettlements?.some((x: any) => x.status === "confirmed" && x.txHash) ??
      false,
  },
];

/**
 * Live payment pipeline: proves the end-to-end flow with real counters.
 * Deposit → meter → reserve → settle → provider receipt.
 */
export function LiveFlow() {
  const { data, isLoading } = useSWR("/api/overview", fetcher, {
    refreshInterval: 4_000,
    revalidateOnFocus: true,
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-3xl border border-[#EAE7DE] bg-white p-6">
        <div className="text-sm text-[#73766D]">Loading live flow…</div>
      </div>
    );
  }

  const allActive = steps.every((s) => s.active(data));
  const someActive = steps.some((s) => s.active(data));

  return (
    <div className="rounded-3xl border border-[#EAE7DE] bg-white p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-[#191A16]">
            Live payment flow
          </h2>
          <p className="mt-0.5 text-xs text-[#73766D]">
            Funded agent → paid API calls → confirmed onchain settlement to
            provider
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold",
            allActive
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
              : someActive
                ? "bg-[#FCFF52]/30 text-[#191A16] ring-1 ring-[#FCFF52]"
                : "bg-gray-100 text-gray-600 ring-1 ring-gray-200"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              allActive
                ? "bg-emerald-500 animate-pulse"
                : someActive
                  ? "bg-[#FCFF52]"
                  : "bg-gray-400"
            )}
          />
          {allActive
            ? "Flow complete"
            : someActive
              ? "Flow in progress"
              : "Waiting for deposit"}
        </span>
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step, i) => {
          const on = step.active(data);
          return (
            <li
              key={step.id}
              className={cn(
                "relative rounded-2xl border p-4 transition-colors",
                on
                  ? "border-[#FCFF52] bg-[#FCFF52]/10"
                  : "border-[#EAE7DE] bg-[#FAF9F5]"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    on ? "text-[#191A16]" : "text-[#73766D]"
                  )}
                >
                  {step.title}
                </span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    on ? "bg-[#FCFF52] ring-2 ring-[#191A16]/10" : "bg-gray-300"
                  )}
                />
              </div>
              <div className="mt-2 text-lg font-bold tabular-nums text-[#191A16]">
                {step.value(data)}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-[#73766D]">
                {step.sub(data)}
              </div>
              <div className="mt-2 text-[10px] text-[#9A9C93]">
                {step.description}
              </div>
              {i < steps.length - 1 && (
                <div className="absolute -right-2 top-1/2 hidden h-px w-2 bg-[#EAE7DE] lg:block" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
