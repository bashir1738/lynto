// POST /api/settle — create and execute an eligible settlement batch.
// Requires operator credentials (server-side private key).
// Accepts body: { agentId?: string } — settles one agent, or all with
// eligible usage if agentId omitted.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasOperatorCredentials } from "@/lib/auth";
import { createAndExecuteSettlement, reconcileAgent } from "@/lib/settlement";
import { syncReservations } from "@/lib/metering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!hasOperatorCredentials()) {
    return NextResponse.json(
      { error: "Settlement operator not configured" },
      { status: 503 }
    );
  }

  let body: { agentId?: string; reconcile?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  try {
    if (body.agentId) {
      // Sync reservations first so onchain reserved >= accrued before settle.
      await syncReservations(body.agentId, { force: true });

      const result = await createAndExecuteSettlement(body.agentId);
      const reconciliation = body.reconcile
        ? await reconcileAgent(body.agentId).catch(() => null)
        : undefined;

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        batchId: result.batchId,
        amount: result.amount.toString(),
        requestCount: result.requestCount,
        txHash: result.txHash,
        status: result.status,
        reconciliation: reconciliation
          ? {
              onchainSettled: reconciliation.onchainSettled.toString(),
              dbSettled: reconciliation.dbSettled.toString(),
              matched: reconciliation.matched,
            }
          : undefined,
      });
    }

    // Settle all agents with accrued usage.
    const agentsWithUsage = await prisma.agent.findMany({
      where: {
        status: "active",
        usageRecords: { some: { status: "accrued" } },
      },
      select: { id: true, name: true },
    });

    const results = [];
    for (const a of agentsWithUsage) {
      await syncReservations(a.id, { force: true });
      const r = await createAndExecuteSettlement(a.id);
      results.push({
        agentId: a.id,
        agentName: a.name,
        ...r,
        ...(r.ok
          ? { amount: r.amount.toString() }
          : {}),
      });
    }

    return NextResponse.json({ settled: results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Settlement failed" },
      { status: 500 }
    );
  }
}
