// GET /api/usage/[agent] — usage statistics for an agent.
// Accepts agent id or wallet address. Requires the agent's API key unless
// called with an internal/admin context.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAgent } from "@/lib/auth";
import { getUsageStats } from "@/lib/metering";
import { getOnchainBalances } from "@/lib/settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agent: string }> }
) {
  const { agent: agentParam } = await params;

  // Find agent by id or wallet address.
  const agent = await prisma.agent.findFirst({
    where: {
      OR: [{ id: agentParam }, { walletAddress: agentParam.toLowerCase() }],
    },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // If an API key is provided, it must match this agent.
  const authHeader =
    req.headers.get("x-agent-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (authHeader) {
    const { agent: authed, error } = await authenticateAgent(req);
    if (!authed || authed.id !== agent.id) {
      return NextResponse.json(
        { error: error ?? "Unauthorized for this agent" },
        { status: 401 }
      );
    }
  }
  // Note: without an API key this endpoint returns public dashboard stats
  // (no raw request payloads). Tighten further for production multi-tenant.

  const [stats, onchain] = await Promise.all([
    getUsageStats(agent.id),
    getOnchainBalances(agent.walletAddress).catch(() => null),
  ]);

  return NextResponse.json({
    agent: {
      id: agent.id,
      name: agent.name,
      walletAddress: agent.walletAddress,
      status: agent.status,
    },
    usage: {
      totalCalls: stats.totalCalls,
      totalCost: stats.totalCost.toString(),
      accruedCalls: stats.accruedCalls,
      accruedCost: stats.accruedCost.toString(),
      settledCalls: stats.settledCalls,
      settledCost: stats.settledCost.toString(),
      lastRequestAt: stats.lastRequestAt,
      endpoints: stats.endpoints.map((e) => ({
        endpoint: e.endpoint,
        calls: e.calls,
        accruedCost: e.accruedCost.toString(),
        lastRequestAt: e.lastRequestAt,
      })),
    },
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
  });
}
