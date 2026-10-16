// Usage metering: reservations, spending limits, concurrent safety.
//
// The backend meters API usage offchain. It maintains a conservative local
// spending limit derived from onchain balance minus accrued unsettled usage,
// and periodically syncs reservations to the contract so users cannot
// withdraw funds already committed to accrued usage.

import { prisma } from "./db";
import {
  getOnchainBalances,
  getOperatorWalletClient,
  getContractAddress,
  getChain,
  getPublicClient,
} from "./settlement";
import { USDC_DECIMALS } from "./arc";

/** Price per successful paid API request, in USDC base units (6 decimals). */
export const PRICE_PER_REQUEST = 1_000n; // 0.001 USDC

/** Endpoint identifier for the paid market-data endpoint. */
export const PAID_ENDPOINT = "paid-data";

/** Auto-settle when accrued calls reach this many (configurable via env). */
export const SETTLE_THRESHOLD_CALLS = parseInt(
  process.env.SETTLE_THRESHOLD_CALLS ?? "100",
  10
);

/** Minimum accrued amount before an onchain reserve sync, in base units. */
export const RESERVE_SYNC_THRESHOLD = BigInt(
  process.env.RESERVE_SYNC_THRESHOLD ?? "50000" // 0.05 USDC
);

const RESERVE_ABI = [
  {
    type: "function",
    name: "reserve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/**
 * Try to authorize and charge a paid request for an agent.
 * Uses a DB transaction with the agent row locked to prevent concurrent
 * requests from spending the same remaining funds.
 */
export async function authorizeAndCharge(opts: {
  agentId: string;
  walletAddress: string;
  requestId: string;
  endpoint: string;
  price: bigint;
}): Promise<
  | { ok: true; usageRecordId: string; price: bigint; duplicate: boolean }
  | { ok: false; reason: string; available?: bigint }
> {
  const { agentId, walletAddress, requestId, endpoint, price } = opts;

  // Idempotency: if this requestId was already recorded, return prior result
  // without charging again.
  const existing = await prisma.usageRecord.findUnique({
    where: { requestId },
    select: { id: true, status: true, price: true },
  });
  if (existing) {
    if (existing.status === "failed") {
      return { ok: false, reason: "Previous attempt failed" };
    }
    return {
      ok: true,
      usageRecordId: existing.id,
      price: existing.price,
      duplicate: true,
    };
  }

  // Lock the agent row to serialize concurrent authorizations for this agent.
  return prisma.$transaction(async (tx) => {
    const agents = await tx.$queryRaw<
      Array<{ id: string; walletAddress: string; status: string }>
    >`SELECT id, "walletAddress", status FROM "Agent" WHERE id = ${agentId} FOR UPDATE`;

    if (!agents.length || agents[0].status !== "active") {
      return { ok: false, reason: "Agent not active" as const };
    }

    // Local accrued unsettled sum (conservative spending limit).
    const accrued = await tx.usageRecord.aggregate({
      where: { agentId, status: { in: ["pending", "accrued", "settling"] } },
      _sum: { price: true },
    });
    const accruedTotal = accrued._sum.price ?? 0n;

    // Onchain prepaid balance (balanceOf).
    let onchainBalance: bigint;
    try {
      const bal = await getOnchainBalances(walletAddress);
      onchainBalance = bal.balance;
    } catch {
      // If RPC is unreachable, fall back to a hard local cap to stay safe.
      onchainBalance = accruedTotal; // no headroom
    }

    const remaining = onchainBalance - accruedTotal;
    if (remaining < price) {
      return {
        ok: false,
        reason: "Insufficient prepaid balance" as const,
        available: remaining > 0n ? remaining : 0n,
      };
    }

    // Record usage before reporting a successful chargeable response.
    const record = await tx.usageRecord.create({
      data: {
        requestId,
        agentId,
        walletAddress,
        endpoint,
        price,
        status: "pending",
      },
    });

    return { ok: true, usageRecordId: record.id, price, duplicate: false };
  });
}

/** Mark a usage record as accrued (successful) after the response is served. */
export async function markAccrued(usageRecordId: string): Promise<void> {
  await prisma.usageRecord.update({
    where: { id: usageRecordId },
    data: { status: "accrued" },
  });
}

/** Mark a usage record as failed (not chargeable). */
export async function markFailed(
  usageRecordId: string,
  errorMessage: string
): Promise<void> {
  await prisma.usageRecord.update({
    where: { id: usageRecordId },
    data: { status: "failed", errorMessage: errorMessage.slice(0, 500) },
  });
}

/** Get usage statistics for an agent. */
export async function getUsageStats(agentId: string) {
  const [byEndpoint, totals, lastRecord, accrued, settled] = await Promise.all([
    prisma.usageRecord.groupBy({
      by: ["endpoint"],
      where: { agentId, status: { in: ["pending", "accrued", "settled"] } },
      _count: { id: true },
      _sum: { price: true },
      _max: { createdAt: true },
    }),
    prisma.usageRecord.aggregate({
      where: { agentId },
      _count: { id: true },
      _sum: { price: true },
    }),
    prisma.usageRecord.findFirst({
      where: { agentId, status: { in: ["pending", "accrued", "settled"] } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.usageRecord.aggregate({
      where: { agentId, status: { in: ["pending", "accrued", "settling"] } },
      _count: { id: true },
      _sum: { price: true },
    }),
    prisma.usageRecord.aggregate({
      where: { agentId, status: "settled" },
      _count: { id: true },
      _sum: { price: true },
    }),
  ]);

  return {
    endpoints: byEndpoint.map((e) => ({
      endpoint: e.endpoint,
      calls: e._count.id,
      accruedCost: e._sum.price ?? 0n,
      lastRequestAt: e._max.createdAt ?? null,
    })),
    totalCalls: totals._count.id,
    totalCost: totals._sum.price ?? 0n,
    accruedCalls: accrued._count.id,
    accruedCost: accrued._sum.price ?? 0n,
    settledCalls: settled._count.id,
    settledCost: settled._sum.price ?? 0n,
    lastRequestAt: lastRecord?.createdAt ?? null,
  };
}

/**
 * Force a reservation sync: push local accrued unsettled amount onchain
 * via contract.reserve(). Called before showing withdrawable amounts and
 * periodically by the settlement loop.
 */
export async function syncReservations(
  agentId: string,
  opts: { force?: boolean } = {}
): Promise<{
  synced: boolean;
  amount?: bigint;
  txHash?: string;
  error?: string;
}> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { synced: false, error: "Agent not found" };

  const accrued = await prisma.usageRecord.aggregate({
    where: { agentId, status: { in: ["pending", "accrued", "settling"] } },
    _sum: { price: true },
  });
  const accruedTotal = accrued._sum.price ?? 0n;

  if (accruedTotal === 0n) return { synced: false };

  try {
    const bal = await getOnchainBalances(agent.walletAddress);
    const alreadyReserved = bal.reserved;
    const toReserve = accruedTotal - alreadyReserved;

    if (toReserve <= 0n) {
      return { synced: true, amount: 0n };
    }

    if (!opts.force && toReserve < RESERVE_SYNC_THRESHOLD) {
      return { synced: false, amount: toReserve };
    }

    const client = getOperatorWalletClient();
    if (!client) return { synced: false, error: "Operator not configured" };

    const contract = getContractAddress();
    if (!contract) return { synced: false, error: "Contract not configured" };

    const chain = getChain();
    const publicClient = getPublicClient();

    const hash = await client.writeContract({
      address: contract,
      abi: RESERVE_ABI,
      functionName: "reserve",
      args: [agent.walletAddress as `0x${string}`, toReserve],
      account: client.account,
      chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return {
        synced: false,
        error: "Reserve transaction failed",
        txHash: hash,
      };
    }

    await prisma.reservationSync.create({
      data: { agentId, amount: toReserve, txHash: hash, status: "confirmed" },
    });

    return { synced: true, amount: toReserve, txHash: hash };
  } catch (err) {
    return {
      synced: false,
      error: err instanceof Error ? err.message : "Reserve sync failed",
    };
  }
}

export { USDC_DECIMALS };
