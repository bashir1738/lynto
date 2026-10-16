// Demo agent: an autonomous software client that pays for API access with USDC.
//
// Modes:
//   local   — points at LYNTO_APP_URL (default http://localhost:3000)
//   mainnet — explicit; requires LYNTO_APP_URL and DEMO_AGENT_API_KEY set
//
// Usage:
//   pnpm demo-agent              # local mode
//   LYNTO_MODE=mainnet pnpm demo-agent
//
// Env vars (see .env.example):
//   LYNTO_APP_URL, DEMO_AGENT_API_KEY, DEMO_AGENT_WALLET_ADDRESS,
//   DEMO_AGENT_CALLS, DEMO_AGENT_SPEND_LIMIT

import "dotenv/config";

const MODE = process.env.LYNTO_MODE === "mainnet" ? "mainnet" : "local";
const BASE_URL = process.env.LYNTO_APP_URL ?? "http://localhost:3000";
const API_KEY = process.env.DEMO_AGENT_API_KEY ?? "";
const WALLET = process.env.DEMO_AGENT_WALLET_ADDRESS ?? "";
const MAX_CALLS = parseInt(process.env.DEMO_AGENT_CALLS ?? "50", 10);
const SPEND_LIMIT = BigInt(process.env.DEMO_AGENT_SPEND_LIMIT ?? "100000"); // 0.1 USDC

const PRICE = 1_000n; // 0.001 USDC in base units

function fmt(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

async function main() {
  console.log(`\n=== Lynto demo agent (${MODE} mode) ===\n`);
  console.log(`App URL:  ${BASE_URL}`);
  console.log(`Wallet:   ${WALLET || "(unset)"}`);
  console.log(`Price:    ${fmt(PRICE)} USDC / successful call`);
  console.log(`Limit:    ${MAX_CALLS} calls or ${fmt(SPEND_LIMIT)} USDC total spend\n`);

  if (!API_KEY) {
    console.error("DEMO_AGENT_API_KEY is required. Run `pnpm db:seed` to create the demo agent.");
    process.exit(1);
  }
  if (MODE === "mainnet" && !BASE_URL.startsWith("https://")) {
    console.error("Mainnet mode requires an HTTPS LYNTO_APP_URL.");
    process.exit(1);
  }

  let totalSpend = 0n;
  let successes = 0;
  let failures = 0;
  let lastSettlementTx: string | null = null;

  for (let i = 1; i <= MAX_CALLS; i++) {
    if (totalSpend + PRICE > SPEND_LIMIT) {
      console.log(`[stop] Spend limit reached (${fmt(totalSpend)} USDC).`);
      break;
    }

    const requestId = crypto.randomUUID();
    const started = Date.now();

    try {
      const res = await fetch(`${BASE_URL}/api/paid-data`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-api-key": API_KEY,
          "x-request-id": requestId,
        },
      });

      const body = await res.json().catch(() => ({}));
      const elapsed = Date.now() - started;

      if (res.status === 402) {
        console.log(`[${i}] INSUFFICIENT FUNDS — ${body.error ?? "402"}`);
        console.log(`[stop] Agent cannot afford another call. Remaining available: ${body.available ?? "?"}`);
        break;
      }

      if (!res.ok) {
        failures++;
        console.log(`[${i}] FAIL ${res.status} — ${body.error ?? "unknown"} (${elapsed}ms)`);
        continue;
      }

      if (body.charged === false && body.duplicate) {
        console.log(`[${i}] DUPLICATE (idempotent replay, not charged) (${elapsed}ms)`);
        continue;
      }

      successes++;
      totalSpend += PRICE;
      const symbols = (body.data ?? []).map((d: any) => d.symbol).join(", ");
      console.log(
        `[${i}] OK  paid ${fmt(PRICE)} USDC · total spend ${fmt(totalSpend)} · ${elapsed}ms · ${symbols || "data"}`
      );

      // Small pacing delay so the demo is readable and the backend can keep up.
      await new Promise((r) => setTimeout(r, 50));
    } catch (err) {
      failures++;
      console.log(`[${i}] ERROR — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n--- Session summary ---`);
  console.log(`Successful paid calls: ${successes}`);
  console.log(`Failed calls:          ${failures}`);
  console.log(`Total spent (accrued): ${fmt(totalSpend)} USDC`);
  console.log(`Onchain txs for API calls: 0 (usage metered offchain by design)`);

  // Trigger settlement if there is accrued usage.
  if (successes > 0) {
    console.log(`\nRequesting batch settlement…`);
    try {
      const res = await fetch(`${BASE_URL}/api/settle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (res.ok) {
        const results = body.settled ?? [body];
        for (const r of results) {
          if (r.ok !== false && r.txHash) {
            lastSettlementTx = r.txHash;
            console.log(`Settled batch ${r.batchId?.slice(0, 10)}…`);
            console.log(`  Amount:    ${fmt(BigInt(r.amount))} USDC`);
            console.log(`  Requests:  ${r.requestCount}`);
            console.log(`  Tx hash:   ${r.txHash}`);
            console.log(`  Status:    ${r.status}`);
          } else if (r.error) {
            console.log(`Settlement note: ${r.error}`);
          }
        }
      } else {
        console.log(`Settlement failed: ${body.error ?? res.status}`);
      }
    } catch (err) {
      console.log(`Settlement error: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Reconcile remaining balance via usage endpoint.
  if (WALLET) {
    try {
      const res = await fetch(`${BASE_URL}/api/usage/${WALLET}`);
      const body = await res.json();
      if (res.ok) {
        console.log(`\n--- Reconciliation ---`);
        console.log(`Onchain prepaid balance: ${fmt(BigInt(body.onchain?.balance ?? 0))} USDC`);
        console.log(`Available:               ${fmt(BigInt(body.onchain?.available ?? 0))} USDC`);
        console.log(`Reserved (accrued):      ${fmt(BigInt(body.onchain?.reserved ?? 0))} USDC`);
        console.log(`Settled (onchain):       ${fmt(BigInt(body.onchain?.totalSettled ?? 0))} USDC`);
        console.log(`Settled (offchain sum):  ${fmt(BigInt(body.usage?.settledCost ?? 0))} USDC`);
      }
    } catch {
      // non-fatal
    }
  }

  if (lastSettlementTx) {
    console.log(`\nExplorer: https://explorer.arc.io/tx/${lastSettlementTx}`);
  }
  console.log(`\nDone.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
