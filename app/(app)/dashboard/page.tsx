"use client";

import useSWR from "swr";
import {
  Stat,
  Card,
  LoadingState,
  ErrorState,
  EmptyState,
  Badge,
} from "@/components/ui/primitives";
import { formatUsdc, formatDateTime, shortAddress } from "@/lib/utils";
import { explorerTxUrl } from "@/lib/arc";
import { FundingPanel } from "@/components/funding-panel";
import { LiveFlow } from "@/components/live-flow";
import { OperatorPanel } from "@/components/operator-panel";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DashboardPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/overview", fetcher, {
    refreshInterval: 8_000,
    revalidateOnFocus: true,
  });
  const { data: agentsData } = useSWR("/api/agents", fetcher, {
    refreshInterval: 15_000,
  });

  if (isLoading) return <LoadingState label="Loading overview…" />;
  if (error)
    return (
      <ErrorState message="Failed to load overview" onRetry={() => mutate()} />
    );

  const t = data.totals;
  const settlements = data.recentSettlements ?? [];
  const agents = agentsData?.agents ?? [];
  const confirmed = settlements.filter((s: any) => s.status === "confirmed");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#191A16]">
            Overview
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#73766D]">
            Prepaid balances, live metering, and confirmed batched settlements —
            software paying for APIs in USDC on Arc.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <a href="/integration" className="btn-secondary">
            Integration guide
          </a>
          <a href="/transactions" className="btn-dark">
            Settlements →
          </a>
        </div>
      </div>

      {/* 1. Live end-to-end flow proof */}
      <LiveFlow />

      {/* 2. Key stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          highlight
          label="Available prepaid"
          value={`${formatUsdc(t.availablePrepaid)} USDC`}
          sub="Unreserved · withdrawable"
        />
        <Stat
          label="Accrued unsettled"
          value={`${formatUsdc(t.accruedUnsettled)} USDC`}
          sub={`${t.accruedCalls} calls pending batch`}
        />
        <Stat
          label="Provider received"
          value={`${formatUsdc(t.totalSettled)} USDC`}
          sub={`${confirmed.length} confirmed batch(es)`}
        />
        <Stat
          label="Successful API calls"
          value={t.successfulCalls.toLocaleString()}
          sub="Metered offchain · 0 txs per call"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Multi-agent demand */}
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#191A16]">
                Agents on Lynto
              </h2>
              <p className="text-xs text-[#73766D]">
                Independent agents with their own prepaid balances
              </p>
            </div>
            <a href="/agents" className="text-xs font-semibold text-accent hover:underline">
              Manage →
            </a>
          </div>
          {agents.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No agents yet" />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {agents.map((a: any) => (
                <div
                  key={a.id}
                  className="rounded-2xl border border-[#EAE7DE] bg-[#FAF9F5] p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[#191A16]">
                      {a.name}
                    </span>
                    <Badge status={a.status} />
                  </div>
                  <div className="mono mt-1 text-[11px] text-[#73766D]">
                    {shortAddress(a.walletAddress)}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[10px] uppercase text-[#9A9C93]">
                        Balance
                      </div>
                      <div className="mono text-sm font-bold">
                        {formatUsdc(a.onchain?.balance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#9A9C93]">
                        Calls
                      </div>
                      <div className="mono text-sm font-bold">
                        {a.usage.totalCalls}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-[#9A9C93]">
                        Settled
                      </div>
                      <div className="mono text-sm font-bold">
                        {formatUsdc(a.onchain?.totalSettled)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Provider earnings */}
          <div className="mt-5 rounded-2xl border border-[#FCFF52] bg-[#FCFF52]/10 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#191A16]">
              Provider revenue (onchain)
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-extrabold tabular-nums text-[#191A16]">
                {formatUsdc(t.totalSettled)} USDC
              </span>
              <span className="text-xs text-[#55584F]">
                from {t.successfulCalls} paid API calls across {t.agentCount}{" "}
                agent(s)
              </span>
            </div>
            {confirmed[0]?.txHash && (
              <a
                href={explorerTxUrl(confirmed[0].txHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-semibold text-[#191A16] underline decoration-[#FCFF52] underline-offset-4"
              >
                Latest confirmed settlement on Arc Explorer ↗
              </a>
            )}
          </div>
        </Card>

        {/* Hardening / operator */}
        <div className="space-y-6">
          <OperatorPanel />
          <FundingPanel
            agentWalletAddress={agents[0]?.walletAddress}
          />
        </div>
      </div>

      {/* Recent settlements */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#191A16]">
            Recent settlements
          </h2>
          <a href="/transactions" className="text-xs text-accent hover:underline">
            View all
          </a>
        </div>
        {settlements.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No settlements yet"
              description="Run the demo agent or accrue usage, then settle from the operator panel."
            />
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-[#EAE7DE]">
            {settlements.slice(0, 6).map((s: any) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{s.agentName}</span>
                    <Badge status={s.status} />
                  </div>
                  <div className="mono mt-0.5 truncate text-xs text-[#73766D]">
                    {shortAddress(s.agentAddress)} · {s.requestCount} reqs ·{" "}
                    {formatDateTime(s.createdAt)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="mono text-sm font-bold">
                    {formatUsdc(s.amount)} USDC
                  </div>
                  {s.txHash && (
                    <a
                      href={explorerTxUrl(s.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent hover:underline"
                    >
                      Explorer ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
