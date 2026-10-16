"use client";

import useSWR from "swr";
import { useState } from "react";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  Badge,
  Card,
} from "@/components/ui/primitives";
import { formatUsdc, formatDateTime, shortAddress } from "@/lib/utils";
import { explorerAddressUrl } from "@/lib/arc";
import { FundingPanel } from "@/components/funding-panel";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function RegisterAgentForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setApiKey(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, walletAddress: wallet }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Registration failed");
        return;
      }
      setApiKey(body.apiKey);
      setName("");
      setWallet("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="text-sm font-bold text-[#191A16]">Register second agent</h3>
      <p className="mt-1 text-xs text-[#73766D]">
        Proves multi-agent demand — each agent has its own prepaid balance and
        API key.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label className="stat-label" htmlFor="agent-name">
            Name
          </label>
          <input
            id="agent-name"
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Research Agent"
            required
          />
        </div>
        <div>
          <label className="stat-label" htmlFor="agent-wallet">
            Wallet address
          </label>
          <input
            id="agent-wallet"
            className="input mt-1 font-mono text-xs"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x…"
            required
          />
        </div>
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </p>
        )}
        {apiKey && (
          <div className="rounded-lg bg-[#FCFF52]/30 px-3 py-2 text-xs ring-1 ring-[#FCFF52]">
            <p className="font-bold">API key (copy now — shown once):</p>
            <code className="mt-1 block break-all font-mono">{apiKey}</code>
          </div>
        )}
        <button className="btn-primary w-full text-xs" disabled={busy}>
          {busy ? "Registering…" : "Register agent"}
        </button>
      </form>
    </Card>
  );
}

export default function AgentsPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/agents", fetcher, {
    refreshInterval: 12_000,
  });
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Loading agents…" />;
  if (error)
    return (
      <ErrorState message="Failed to load agents" onRetry={() => mutate()} />
    );

  const agents = data.agents ?? [];
  const agent = agents.find((a: any) => a.id === selected) ?? agents[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#191A16]">
            Agents
          </h1>
          <p className="mt-1 text-sm text-[#73766D]">
            Autonomous software identities with prepaid USDC balances and scoped
            API access. Multiple agents share the settlement operator but keep
            isolated accounting.
          </p>
        </div>
        <span className="rounded-full bg-[#FCFF52]/30 px-3 py-1 text-xs font-bold text-[#191A16] ring-1 ring-[#FCFF52]">
          {agents.length} agent{agents.length === 1 ? "" : "s"}
        </span>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          title="No agents registered"
          description="Register below or run scripts/seed.ts."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3">
            {agents.map((a: any) => (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                className={`w-full rounded-3xl border p-5 text-left transition-all duration-200 ${
                  agent?.id === a.id
                    ? "border-[#FCFF52] bg-[#FCFF52]/15 shadow-soft ring-1 ring-[#FCFF52]"
                    : "border-[#EAE7DE] bg-white hover:border-[#DED9CD] shadow-xs"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#191A16]">
                    {a.name}
                  </span>
                  <Badge status={a.status} />
                </div>
                <div className="mono mt-1 text-xs text-[#73766D]">
                  {shortAddress(a.walletAddress)}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#EAE7DE]/60 pt-2 text-xs">
                  <span className="font-bold">
                    {formatUsdc(a.onchain?.balance)} USDC
                  </span>
                  <span className="text-[#73766D]">
                    {a.usage.totalCalls} calls
                  </span>
                </div>
              </button>
            ))}
            <RegisterAgentForm onDone={() => mutate()} />
          </div>

          {agent && (
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{agent.name}</h2>
                    <a
                      href={explorerAddressUrl(agent.walletAddress)}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-sm text-accent hover:underline"
                    >
                      {agent.walletAddress}
                    </a>
                  </div>
                  <Badge status={agent.status} />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    ["Prepaid balance", formatUsdc(agent.onchain?.balance)],
                    ["Available", formatUsdc(agent.onchain?.available)],
                    ["Accrued unsettled", formatUsdc(agent.usage.accruedCost)],
                    ["Total settled", formatUsdc(agent.onchain?.totalSettled)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="stat-label">{label}</div>
                      <div className="mono mt-1 text-lg font-bold">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl bg-[#FAF9F5] p-4 text-sm">
                  <h3 className="stat-label">API access</h3>
                  <p className="mt-2 text-[#55584F]">
                    Endpoint{" "}
                    <span className="mono font-semibold">GET /api/paid-data</span>{" "}
                    · Auth <span className="mono">x-agent-api-key</span> · Price{" "}
                    <span className="mono">0.001 USDC / successful call</span>
                  </p>
                  <p className="mt-2 text-xs text-[#73766D]">
                    Usage: {agent.usage.totalCalls} total ·{" "}
                    {agent.usage.settledCalls} settled ·{" "}
                    {agent.usage.accruedCalls} accrued · Last request:{" "}
                    {formatDateTime(agent.usage.lastRequestAt)}
                  </p>
                </div>
              </Card>

              <FundingPanel agentWalletAddress={agent.walletAddress} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
