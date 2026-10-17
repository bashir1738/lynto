"use client";

import { CodeBlock } from "@/components/code-block";
import { Card } from "@/components/ui/primitives";

const SDK_CODE = `// lynto-sdk.ts — minimal TypeScript client for Lynto paid APIs
// npm i lynto  (or copy this file into your agent)

const BASE = process.env.LYNTO_BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.LYNTO_AGENT_API_KEY!; // lynto_…

export interface PaidCallOptions {
  /** Idempotency key — reuse to retry safely without double-charging */
  requestId?: string;
  signal?: AbortSignal;
}

export interface PaidCallResult<T> {
  data: T;
  charged: boolean;
  duplicate: boolean;
  requestId: string;
  price: string; // USDC base units (6 decimals)
}

/** Call a paid endpoint. Throws on 401/402/network errors. */
export async function callPaid<T = unknown>(
  path = "/api/paid-data",
  opts: PaidCallOptions = {}
): Promise<PaidCallResult<T>> {
  const requestId = opts.requestId ?? crypto.randomUUID();
  const res = await fetch(\`\${BASE}\${path}\`, {
    method: "GET",
    headers: {
      "x-agent-api-key": API_KEY,
      "x-request-id": requestId,
    },
    signal: opts.signal,
  });

  if (res.status === 401) throw new Error("Invalid or missing agent API key");
  if (res.status === 402) {
    const body = await res.json().catch(() => ({}));
    throw new Error(\`Insufficient prepaid balance: \${body.error ?? "402"}\`);
  }
  if (!res.ok) throw new Error(\`Paid API error \${res.status}\`);

  const body = await res.json();
  return {
    data: body.data as T,
    charged: Boolean(body.charged),
    duplicate: Boolean(body.duplicate),
    requestId: body.requestId ?? requestId,
    price: body.price ?? "1000",
  };
}

/** Read usage + onchain balances for this agent wallet. */
export async function getUsage(walletOrId: string) {
  const res = await fetch(\`\${BASE}/api/usage/\${walletOrId}\`, {
    headers: { "x-agent-api-key": API_KEY },
  });
  if (!res.ok) throw new Error(\`Usage fetch failed: \${res.status}\`);
  return res.json();
}

// --- Example agent loop -------------------------------------------------
async function main() {
  const spendLimit = 50_000n; // 0.05 USDC
  let spent = 0n;

  while (spent < spendLimit) {
    const { data, price } = await callPaid("/api/paid-data");
    spent += BigInt(price);
    console.log("got market data", data, "spent", spent.toString());
  }

  // Optional: request settlement (usually the backend/operator does this)
  // await fetch(\`\${BASE}/api/settle\`, { method: "POST" });
}

main().catch(console.error);
`;

const CURL_CODE = `# 1. Register an agent (returns API key ONCE)
curl -X POST "$LYNTO_URL/api/agents" \\
  -H "content-type: application/json" \\
  -d '{"name":"Research Agent","walletAddress":"0xYourWallet"}'

# 2. Call the paid endpoint
curl -X POST "$LYNTO_URL/api/paid-data" \\
  -H "x-agent-api-key: lynto_..." \\
  -H "x-request-id: $(uuidgen)"

# 3. Check usage / balances
curl "$LYNTO_URL/api/usage/0xYourWallet" \\
  -H "x-agent-api-key: lynto_..."
`;

const ONCHAIN_CODE = `// Fund + withdraw from a wallet (viem) — owner side
import { createWalletClient, http, parseUnits } from "viem";
import { arc } from "viem/chains"; // or custom Arc chain def

const USDC = "0x3600000000000000000000000000000000000000"; // Arc
const LYNTO = "0xYourLyntoPaymentsAddress";
const usdc6 = (n: number) => parseUnits(String(n), 6);

// Approve + deposit 1 USDC
await wallet.writeContract({
  address: USDC,
  abi: [{ name: "approve", type: "function", inputs: [
    { name: "spender", type: "address" },
    { name: "amount", type: "uint256" },
  ], outputs: [] }],
  functionName: "approve",
  args: [LYNTO, usdc6(1)],
});
await wallet.writeContract({
  address: LYNTO,
  abi: [{ name: "deposit", type: "function", inputs: [
    { name: "amount", type: "uint256" },
  ], outputs: [] }],
  functionName: "deposit",
  args: [usdc6(1)],
});

// Withdraw in two steps — only availableOf(agent), never reserved funds:
// 1) request, 2) wait withdrawDelay() (10 min default), 3) execute
await wallet.writeContract({
  address: LYNTO,
  abi: [{ name: "requestWithdraw", type: "function", inputs: [
    { name: "amount", type: "uint256" },
  ], outputs: [] }],
  functionName: "requestWithdraw",
  args: [usdc6(1)],
});
// …after withdrawDelay() has elapsed:
await wallet.writeContract({
  address: LYNTO,
  abi: [{ name: "executeWithdraw", type: "function", inputs: [], outputs: [] }],
  functionName: "executeWithdraw",
});
`;

const PRICING = `Price per successful call : 0.001 USDC (1_000 base units)
Auth                     : x-agent-api-key (hashed at rest)
Idempotency              : x-request-id (UUID) — safe retries
Failure policy           : failed requests are NOT charged
Settlement               : batched by operator; unique batchId onchain
Reserved funds           : locked so agents cannot withdraw accrued usage
Withdrawals              : two-step (request → delay → execute), 10 min default
`;

export default function IntegrationPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#191A16]">
          Integration
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[#73766D]">
          Connect an agent in minutes: register, authenticate with an API key,
          call paid endpoints, and let Lynto batch-settle USDC on Arc.
        </p>
      </div>

      {/* Quickstart steps */}
      <ol className="grid gap-4 md:grid-cols-4">
        {[
          {
            n: "1",
            t: "Register agent",
            d: "POST /api/agents → store the API key (shown once)",
          },
          {
            n: "2",
            t: "Fund prepaid",
            d: "Approve USDC + deposit() on LyntoPayments (6 decimals)",
          },
          {
            n: "3",
            t: "Call paid API",
            d: "Header x-agent-api-key + x-request-id",
          },
          {
            n: "4",
            t: "Settle batch",
            d: "Operator settles accrued usage; provider receives USDC",
          },
        ].map((s) => (
          <li
            key={s.n}
            className="rounded-2xl border border-[#EAE7DE] bg-white p-4 shadow-xs"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FCFF52] text-xs font-extrabold text-[#0A0A0A]">
              {s.n}
            </span>
            <div className="mt-3 text-sm font-bold text-[#191A16]">{s.t}</div>
            <div className="mt-1 text-xs text-[#73766D]">{s.d}</div>
          </li>
        ))}
      </ol>

      {/* Pricing table */}
      <Card>
        <h2 className="text-sm font-bold text-[#191A16]">Pricing &amp; protocol</h2>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-[#FAF9F5] p-4 font-mono text-[12px] leading-relaxed text-[#3A3A34]">
          {PRICING}
        </pre>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[#191A16]">
            TypeScript SDK (drop-in)
          </h2>
          <p className="text-xs text-[#73766D]">
            Copy into your agent project. No dependency on this monorepo.
          </p>
          <CodeBlock code={SDK_CODE} filename="lynto-sdk.ts" />
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold text-[#191A16]">curl</h2>
            <div className="mt-3">
              <CodeBlock code={CURL_CODE} language="bash" filename="quickstart.sh" />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#191A16]">
              Onchain funding (viem)
            </h2>
            <div className="mt-3">
              <CodeBlock code={ONCHAIN_CODE} filename="fund.ts" />
            </div>
          </div>
        </div>
      </div>

      {/* Endpoint reference */}
      <Card>
        <h2 className="text-sm font-bold text-[#191A16]">HTTP API reference</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#EAE7DE] text-[10px] uppercase text-[#73766D]">
              <tr>
                <th className="py-2 pr-4 font-semibold">Method</th>
                <th className="py-2 pr-4 font-semibold">Path</th>
                <th className="py-2 pr-4 font-semibold">Auth</th>
                <th className="py-2 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE7DE]/70">
              {[
                ["GET/POST", "/api/paid-data", "x-agent-api-key", "Paid market data · 0.001 USDC / success"],
                ["GET", "/api/usage/[agent]", "optional key", "Usage stats + onchain balances"],
                ["POST", "/api/settle", "operator (server)", "Create + execute settlement batches"],
                ["GET", "/api/settlements", "—", "Batch history + explorer links"],
                ["GET", "/api/agents", "—", "List agents"],
                ["POST", "/api/agents", "—", "Register agent (API key returned once)"],
                ["POST", "/api/withdraw-prep", "—", "Sync reserves · return withdrawable amount"],
                ["GET", "/api/overview", "—", "Dashboard aggregates"],
                ["GET", "/api/system/status", "—", "Operator health · config readiness"],
              ].map((row) => (
                <tr key={row[1] + row[0]}>
                  <td className="py-2.5 pr-4 font-mono font-semibold text-[#191A16]">
                    {row[0]}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[#3A3A34]">{row[1]}</td>
                  <td className="py-2.5 pr-4 text-[#73766D]">{row[2]}</td>
                  <td className="py-2.5 text-[#55584F]">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
