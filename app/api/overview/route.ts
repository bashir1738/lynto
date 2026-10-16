// GET /api/overview — dashboard overview aggregates.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOnchainBalances } from "@/lib/settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const agents = await prisma.agent.findMany();

  // Aggregate offchain usage.
  const [settledAgg, accruedAgg, callCount, recentBatches] = await Promise.all([
    prisma.usageRecord.aggregate({
      where: { status: "settled" },
      _sum: { price: true },
    }),
    prisma.usageRecord.aggregate({
      where: { status: { in: ["pending", "accrued", "settling"] } },
      _sum: { price: true },
      _count: { id: true },
    }),
    prisma.usageRecord.count({
      where: { status: { in: ["accrued", "settled", "settling"] } },
    }),
    prisma.settlementBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { agent: { select: { name: true, walletAddress: true } } },
    }),
  ]);

  // Aggregate onchain balances across all agents.
  let totalDeposited = 0n;
  let totalAvailable = 0n;
  let totalReserved = 0n;
  let totalSettledOnchain = 0n;

  for (const a of agents) {
    try {
      const b = await getOnchainBalances(a.walletAddress);
      totalDeposited += b.totalDeposited;
      totalAvailable += b.available;
      totalReserved += b.reserved;
      totalSettledOnchain += b.totalSettled;
    } catch {
      // RPC unavailable — skip this agent for onchain totals
    }
  }

  return NextResponse.json({
    totals: {
      totalDeposited: totalDeposited.toString(),
      availablePrepaid: totalAvailable.toString(),
      accruedUnsettled: (accruedAgg._sum.price ?? 0n).toString(),
      accruedCalls: accruedAgg._count.id,
      totalSettled: totalSettledOnchain.toString(),
      totalSettledOffchain: (settledAgg._sum.price ?? 0n).toString(),
      successfulCalls: callCount,
      agentCount: agents.length,
      reservedOnchain: totalReserved.toString(),
    },
    recentSettlements: recentBatches.map((b) => ({
      id: b.id,
      batchId: b.batchId,
      agentName: b.agent.name,
      agentAddress: b.agent.walletAddress,
      amount: b.amount.toString(),
      requestCount: b.requestCount,
      status: b.status,
      txHash: b.txHash,
      createdAt: b.createdAt,
      confirmedAt: b.confirmedAt,
    })),
  });
}
