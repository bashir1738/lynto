// GET /api/settlements — settlement history with explorer links.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { explorerTxUrl, ARC_MAINNET_ID, ARC_TESTNET_ID } from "@/lib/arc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  const batches = await prisma.settlementBatch.findMany({
    where: agentId ? { agentId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      agent: { select: { name: true, walletAddress: true } },
      _count: { select: { usageRecords: true } },
    },
  });

  const chainId = parseInt(process.env.ARC_CHAIN_ID ?? "5042", 10);

  return NextResponse.json({
    settlements: batches.map((b) => ({
      id: b.id,
      batchId: b.batchId,
      agentId: b.agentId,
      agentName: b.agent.name,
      agentAddress: b.agent.walletAddress,
      amount: b.amount.toString(),
      requestCount: b.requestCount,
      status: b.status,
      txHash: b.txHash,
      explorerUrl: b.txHash ? explorerTxUrl(b.txHash, chainId) : null,
      errorMessage: b.errorMessage,
      createdAt: b.createdAt,
      submittedAt: b.submittedAt,
      confirmedAt: b.confirmedAt,
    })),
  });
}
