// POST /api/withdraw-prep — sync reservations onchain before a withdrawal,
// then return the exact withdrawable amount for the agent.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncReservations } from "@/lib/metering";
import { getOnchainBalances } from "@/lib/settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { agentId?: string; walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const agent = body.agentId
    ? await prisma.agent.findUnique({ where: { id: body.agentId } })
    : body.walletAddress
      ? await prisma.agent.findUnique({
          where: { walletAddress: body.walletAddress.toLowerCase() },
        })
      : null;

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Force-sync accrued usage to onchain reservations so availableOf is
  // accurate before the user withdraws.
  const sync = await syncReservations(agent.id, { force: true });

  const balances = await getOnchainBalances(agent.walletAddress);

  return NextResponse.json({
    agentId: agent.id,
    walletAddress: agent.walletAddress,
    available: balances.available.toString(),
    balance: balances.balance.toString(),
    reserved: balances.reserved.toString(),
    decimals: 6,
    sync: {
      synced: sync.synced,
      amount: sync.amount?.toString(),
      txHash: sync.txHash,
      error: sync.error,
    },
  });
}
