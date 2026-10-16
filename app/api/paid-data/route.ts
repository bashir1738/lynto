// GET /api/paid-data — paid sample market-price endpoint.
// Authenticates the agent, enforces the server-side price, records usage,
// and serves data only for authorized, sufficiently funded agents.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { authenticateAgent, getIdempotencyKey } from "@/lib/auth";
import {
  authorizeAndCharge,
  markAccrued,
  markFailed,
  PRICE_PER_REQUEST,
  PAID_ENDPOINT,
} from "@/lib/metering";
import {
  createAndExecuteSettlement,
  shouldAutoSettle,
} from "@/lib/settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MarketPrice {
  symbol: string;
  priceUsd: string;
  change24hPct: number;
  timestamp: string;
  source: string;
}

// Deterministic-ish sample prices for demo purposes.
function samplePrices(): MarketPrice[] {
  const now = new Date().toISOString();
  const assets = [
    { symbol: "ETH-USD", base: 3200.5 },
    { symbol: "BTC-USD", base: 64500.25 },
    { symbol: "SOL-USD", base: 142.8 },
    { symbol: "USDC-USD", base: 1.0 },
  ];
  return assets.map((a) => {
    // Pseudo-random small jitter based on current second
    const jitter = (Math.sin(Date.now() / 1000 + a.base) * 0.5) / 100;
    const price = a.base * (1 + jitter);
    return {
      symbol: a.symbol,
      priceUsd: price.toFixed(a.symbol === "USDC-USD" ? 4 : 2),
      change24hPct: parseFloat((jitter * 100 * 24).toFixed(3)),
      timestamp: now,
      source: "lynto-sample-market-data",
    };
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const { agent, error: authError } = await authenticateAgent(req);
  if (!agent) {
    return NextResponse.json(
      { error: authError ?? "Unauthorized" },
      { status: 401 }
    );
  }

  const requestId = getIdempotencyKey(req) ?? randomUUID();
  const price = PRICE_PER_REQUEST;

  const auth = await authorizeAndCharge({
    agentId: agent.id,
    walletAddress: agent.walletAddress,
    requestId,
    endpoint: PAID_ENDPOINT,
    price,
  });

  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.reason,
        available: auth.available?.toString(),
        pricePerRequest: price.toString(),
      },
      { status: 402 }
    );
  }

  // Idempotent replay of a successful request.
  if (auth.duplicate) {
    return NextResponse.json({
      data: samplePrices(),
      charged: false,
      duplicate: true,
      requestId,
      price: price.toString(),
      priceDecimals: 6,
      note: "Duplicate request id — not charged again.",
    });
  }

  try {
    const data = samplePrices();

    // Record usage as accrued before reporting success.
    await markAccrued(auth.usageRecordId);

    // Fire-and-forget auto-settlement check (do not block the response).
    void (async () => {
      try {
        if (await shouldAutoSettle(agent.id)) {
          await createAndExecuteSettlement(agent.id);
        }
      } catch {
        // auto-settle failures are logged in settlement batch records
      }
    })();

    return NextResponse.json({
      data,
      charged: true,
      requestId,
      price: price.toString(),
      priceDecimals: 6,
      endpoint: PAID_ENDPOINT,
    });
  } catch (err) {
    await markFailed(
      auth.usageRecordId,
      err instanceof Error ? err.message : "Internal error"
    );
    return NextResponse.json(
      { error: "Failed to serve paid data" },
      { status: 500 }
    );
  }
}
