// GET /api/agents — list agents with balances and usage summary.
// POST /api/agents — register a new agent (demo/admin).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateApiKey, hashApiKey } from "@/lib/auth";
import { getOnchainBalances } from "@/lib/settlement";
import { getUsageStats } from "@/lib/metering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
  });

  const enriched = await Promise.all(
    agents.map(async (a) => {
      const [onchain, stats] = await Promise.all([
        getOnchainBalances(a.walletAddress).catch(() => null),
        getUsageStats(a.id),
      ]);
      return {
        id: a.id,
        name: a.name,
        walletAddress: a.walletAddress,
        status: a.status,
        createdAt: a.createdAt,
        onchain: onchain
          ? {
              balance: onchain.balance.toString(),
              reserved: onchain.reserved.toString(),
              available: onchain.available.toString(),
              totalDeposited: onchain.totalDeposited.toString(),
              totalWithdrawn: onchain.totalWithdrawn.toString(),
              totalSettled: onchain.totalSettled.toString(),
            }
          : null,
        usage: {
          totalCalls: stats.totalCalls,
          accruedCalls: stats.accruedCalls,
          accruedCost: stats.accruedCost.toString(),
          settledCalls: stats.settledCalls,
          settledCost: stats.settledCost.toString(),
          lastRequestAt: stats.lastRequestAt,
        },
      };
    })
  );

  return NextResponse.json({ agents: enriched });
}

export async function POST(req: NextRequest) {
  let body: { name?: string; walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  const walletAddress = body.walletAddress?.toLowerCase().trim();

  if (!name || !walletAddress) {
    return NextResponse.json(
      { error: "name and walletAddress are required" },
      { status: 400 }
    );
  }
  if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json(
      { error: "walletAddress must be a valid 0x address" },
      { status: 400 }
    );
  }

  const existing = await prisma.agent.findUnique({
    where: { walletAddress },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Agent with this wallet already exists" },
      { status: 409 }
    );
  }

  const apiKey = generateApiKey();
  const agent = await prisma.agent.create({
    data: {
      name,
      walletAddress,
      apiKeyHash: hashApiKey(apiKey),
      status: "active",
    },
  });

  // API key is returned exactly once at creation.
  return NextResponse.json(
    {
      id: agent.id,
      name: agent.name,
      walletAddress: agent.walletAddress,
      apiKey,
      note: "Store this API key securely. It will not be shown again.",
    },
    { status: 201 }
  );
}
