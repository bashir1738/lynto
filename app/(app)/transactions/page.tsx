"use client";

import useSWR from "swr";
import { useState } from "react";
import { LoadingState, ErrorState, EmptyState, Badge } from "@/components/ui/primitives";
import { cn, formatUsdc, formatDateTime, shortAddress } from "@/lib/utils";
import { explorerTxUrl } from "@/lib/arc";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TransactionsPage() {
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const params = new URLSearchParams();
  if (agentFilter) params.set("agentId", agentFilter);
  const url = `/api/settlements${params.toString() ? `?${params}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, {
    refreshInterval: 10_000,
  });
  const { data: agentsData, mutate: mutateAgents } = useSWR("/api/agents", fetcher);

  async function triggerSettle(agentId?: string) {
    setBusy("settle");
    setFeedback(null);
    try {
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentId ? { agentId } : {}),
      });
      const body = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, msg: body.error ?? "Settlement failed" });
      } else {
        const settled = (body.settled ?? []).filter((r: any) => r.ok);
        const failed = (body.settled ?? []).filter((r: any) => !r.ok);
        setFeedback({
          ok: failed.length === 0,
          msg: settled.length
            ? `Confirmed ${settled.length} batch(es) onchain`
            : failed.length
              ? `${failed.length} batch(es) failed — usage returned to accrued for safe retry`
              : "Nothing to settle",
        });
      }
      await Promise.all([mutate(), mutateAgents()]);
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Network error" });
    } finally {
      setBusy(null);
    }
  }

  async function syncReserves() {
    setBusy("sync");
    setFeedback(null);
    try {
      const agents = agentsData?.agents ?? [];
      let synced = 0;
      for (const a of agents) {
        const res = await fetch("/api/withdraw-prep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: a.id }),
        });
        if (res.ok) {
          const body = await res.json();
          if (body.sync?.synced) synced++;
        }
      }
      setFeedback({
        ok: true,
        msg: `Reserve sync complete for ${synced}/${agents.length} agent(s) — accrued usage now locked onchain`,
      });
      await Promise.all([mutate(), mutateAgents()]);
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Network error" });
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <LoadingState label="Loading settlements…" />;
  if (error) return <ErrorState message="Failed to load settlements" onRetry={() => mutate()} />;

  const settlements = data.settlements ?? [];
  const agents = agentsData?.agents ?? [];
  const failedCount = settlements.filter((s: any) => s.status === "failed").length;
  const visible = statusFilter
    ? settlements.filter((s: any) => s.status === statusFilter)
    : settlements;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#191A16]">Settlements</h1>
          <p className="mt-1 text-sm text-[#73766D]">
            Batched onchain settlements. Each transaction transfers USDC for thousands of API calls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-auto font-sans text-xs font-semibold"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
            <option value="">All agents</option>
            {agents.map((a: any) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            className="input w-auto font-sans text-xs font-semibold"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="failed">Failed</option>
          </select>
          <button
            className="btn-secondary"
            disabled={busy !== null}
            onClick={syncReserves}
          >
            {busy === "sync" ? "Syncing…" : "Force reserve sync"}
          </button>
          <button
            className="btn-primary"
            disabled={busy !== null}
            onClick={() => triggerSettle(agentFilter || undefined)}
          >
            {busy === "settle"
              ? "Settling…"
              : failedCount > 0
                ? `Retry settle (${failedCount} failed)`
                : "Settle now ▶"}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-sm ring-1",
            feedback.ok
              ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
              : "bg-red-50 text-red-800 ring-red-200"
          )}
        >
          {feedback.msg}
        </div>
      )}

      {failedCount > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          ⚠ {failedCount} failed batch(es). Failed settlements release their
          usage records back to <strong>accrued</strong> — retry creates a new
          batch ID; a settled batch ID can never be reused.
        </div>
      )}

      {visible.length === 0 && settlements.length > 0 ? (
        <EmptyState
          title="No batches match this filter"
          description="Adjust the status or agent filter above."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No settlement batches"
          description="Trigger a settlement after the demo agent accrues usage, or wait for the auto-settle threshold."
        />
      ) : (
        <div className="rounded-3xl border border-[#EAE7DE] bg-white overflow-hidden shadow-soft">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#EAE7DE] bg-[#FAF9F5] text-xs font-semibold uppercase text-[#73766D]">
              <tr>
                <th className="px-5 py-3.5">Batch</th>
                <th className="px-5 py-3.5">Agent</th>
                <th className="px-5 py-3.5">Requests</th>
                <th className="px-5 py-3.5">Amount</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Transaction</th>
                <th className="px-5 py-3.5">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE7DE]/70 font-sans">
              {visible.map((s: any) => (
                <tr key={s.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3 mono text-xs">
                    {shortAddress(s.batchId, 6)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.agentName}</div>
                    <div className="mono text-xs text-slate-500">
                      {shortAddress(s.agentAddress)}
                    </div>
                  </td>
                  <td className="px-4 py-3 mono">{s.requestCount}</td>
                  <td className="px-4 py-3 mono font-medium">
                    {formatUsdc(s.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge status={s.status} />
                  </td>
                  <td className="px-4 py-3">
                    {s.txHash ? (
                      <a
                        href={s.explorerUrl ?? explorerTxUrl(s.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mono text-xs text-accent hover:underline"
                      >
                        {shortAddress(s.txHash, 8)} ↗
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatDateTime(s.confirmedAt ?? s.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
