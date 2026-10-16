"use client";

import { useState } from "react";
import useSWR from "swr";
import { cn, formatUsdc } from "@/lib/utils";
import { Skeleton } from "@/components/ui/primitives";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Operator / hardening controls:
 * - Settlement retry for failed batches
 * - Force reserve sync before withdrawals
 * - Accounting integrity (offchain vs onchain settled)
 * - Operator key status (presence only — never the key)
 */
export function OperatorPanel() {
  const { data: sys, mutate: mutateSys } = useSWR("/api/system/status", fetcher, {
    refreshInterval: 10_000,
  });
  const { data: overview, mutate: mutateOverview } = useSWR(
    "/api/overview",
    fetcher,
    { refreshInterval: 10_000 }
  );
  const { data: agentsData, mutate: mutateAgents } = useSWR(
    "/api/agents",
    fetcher
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(
    null
  );

  async function settleAll() {
    setBusy("settle");
    setResult(null);
    try {
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) {
        setResult({ ok: false, msg: body.error ?? "Settlement failed" });
      } else {
        const settled = (body.settled ?? []).filter((r: any) => r.ok);
        const failed = (body.settled ?? []).filter((r: any) => !r.ok);
        setResult({
          ok: failed.length === 0,
          msg: settled.length
            ? `Confirmed ${settled.length} batch(es). Latest tx ${settled[settled.length - 1].txHash?.slice(0, 18)}…`
            : failed.length
              ? `${failed.length} batch(es) failed — usage returned to accrued for retry`
              : "No eligible accrued usage to settle",
        });
      }
      await Promise.all([mutateSys(), mutateOverview(), mutateAgents()]);
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(null);
    }
  }

  async function syncReserves() {
    setBusy("sync");
    setResult(null);
    try {
      const agents = agentsData?.agents ?? [];
      let synced = 0;
      for (const a of agents) {
        const res = await fetch("/api/withdraw-prep", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agentId: a.id }),
        });
        const body = await res.json();
        if (res.ok && body.sync?.synced) synced++;
      }
      setResult({
        ok: true,
        msg: `Reserve sync complete for ${synced}/${agents.length} agent(s)`,
      });
      await Promise.all([mutateSys(), mutateOverview()]);
    } catch (e) {
      setResult({ ok: false, msg: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(null);
    }
  }

  async function retryFailed() {
    // Re-settle: failed batches already released usage records back to accrued,
    // so a fresh settle will pick them up with a new batch id.
    await settleAll();
  }

  if (!sys) {
    return (
      <div className="rounded-3xl border border-[#EAE7DE] bg-white p-5">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const integrity =
    overview?.totals?.totalSettled === overview?.totals?.totalSettledOffchain;

  return (
    <div className="rounded-3xl border border-[#EAE7DE] bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#191A16]">
            Operator &amp; hardening
          </h3>
          <p className="mt-0.5 text-xs text-[#73766D]">
            Settlement retries · reserve sync · accounting checks
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold",
            sys.health.ready
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
              : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
          )}
        >
          {sys.health.ready ? "Operator ready" : "Needs config"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-[#FAF9F5] p-3">
          <dt className="text-[#73766D]">Network</dt>
          <dd className="mt-0.5 font-bold text-[#191A16]">{sys.network}</dd>
        </div>
        <div className="rounded-xl bg-[#FAF9F5] p-3">
          <dt className="text-[#73766D]">Operator key</dt>
          <dd
            className={cn(
              "mt-0.5 font-bold",
              sys.operatorConfigured ? "text-emerald-700" : "text-red-700"
            )}
          >
            {sys.operatorConfigured
              ? "Configured (server-side)"
              : "Missing"}
          </dd>
        </div>
        <div className="rounded-xl bg-[#FAF9F5] p-3">
          <dt className="text-[#73766D]">Contract</dt>
          <dd
            className={cn(
              "mt-0.5 font-bold truncate",
              sys.contractReachable ? "text-[#191A16]" : "text-red-700"
            )}
          >
            {sys.contractAddress
              ? `${sys.contractAddress.slice(0, 10)}…`
              : "Not set"}
          </dd>
        </div>
        <div className="rounded-xl bg-[#FAF9F5] p-3">
          <dt className="text-[#73766D]">Accounting</dt>
          <dd
            className={cn(
              "mt-0.5 font-bold",
              integrity ? "text-emerald-700" : "text-amber-700"
            )}
          >
            {integrity ? "Onchain = offchain" : "Mismatch"}
          </dd>
        </div>
        <div className="rounded-xl bg-[#FAF9F5] p-3">
          <dt className="text-[#73766D]">Batches</dt>
          <dd className="mt-0.5 font-bold text-[#191A16]">
            {sys.batches.confirmed} ok · {sys.batches.inFlight} in flight ·{" "}
            <span className={sys.batches.failed ? "text-red-700" : ""}>
              {sys.batches.failed} failed
            </span>
          </dd>
        </div>
        <div className="rounded-xl bg-[#FAF9F5] p-3">
          <dt className="text-[#73766D]">Reserve lag</dt>
          <dd className="mt-0.5 font-bold text-[#191A16]">
            {sys.reserveLagBaseUnits !== null
              ? `${formatUsdc(sys.reserveLagBaseUnits)} USDC`
              : "—"}
          </dd>
        </div>
      </dl>

      {sys.health.warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {sys.health.warnings.map((w: string) => (
            <li
              key={w}
              className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900 ring-1 ring-amber-200"
            >
              <span>⚠</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="btn-primary text-xs"
          disabled={busy !== null || !sys.operatorConfigured}
          onClick={settleAll}
        >
          {busy === "settle" ? "Settling…" : "Settle eligible batches"}
        </button>
        <button
          className="btn-secondary text-xs"
          disabled={busy !== null || !sys.operatorConfigured}
          onClick={sys.batches.failed > 0 ? retryFailed : syncReserves}
        >
          {busy === "sync"
            ? "Syncing…"
            : sys.batches.failed > 0
              ? "Retry failed settlements"
              : "Force reserve sync"}
        </button>
      </div>

      {result && (
        <p
          className={cn(
            "mt-3 rounded-lg px-3 py-2 text-xs",
            result.ok
              ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
              : "bg-red-50 text-red-800 ring-1 ring-red-200"
          )}
        >
          {result.msg}
        </p>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-[#9A9C93]">
        Withdrawals only spend <strong>unreserved</strong> funds. Force reserve
        sync before large withdrawals so accrued usage stays locked onchain.
        Failed batches release their usage records for safe retry (new batch ID
        — never reuses a settled ID).
      </p>
    </div>
  );
}
