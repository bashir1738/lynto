// GET /api/system/status — operator/system health for the hardening dashboard.
// Never exposes private keys. Used by the dashboard to show configuration
// readiness, failed settlements needing retry, and reserve sync lag.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasOperatorCredentials } from "@/lib/auth";
import { getContractAddress, getChain, getPublicClient } from "@/lib/settlement";
import { SETTLE_THRESHOLD_CALLS, RESERVE_SYNC_THRESHOLD, PRICE_PER_REQUEST } from "@/lib/metering";
import { ARC_MAINNET_ID, ARC_TESTNET_ID } from "@/lib/arc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const contract = getContractAddress();
  const chain = getChain();
  const chainId = chain.id;

  let contractReachable = false;
  let provider: string | null = null;
  if (contract) {
    try {
      const client = getPublicClient();
      provider = (await client.readContract({
        address: contract,
        abi: [
          {
            type: "function",
            name: "provider",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "", type: "address" }],
          },
        ] as const,
        functionName: "provider",
      })) as string;
      contractReachable = true;
    } catch {
      contractReachable = false;
    }
  }

  const [failedBatches, pendingBatches, confirmedBatches, agents] =
    await Promise.all([
      prisma.settlementBatch.count({ where: { status: "failed" } }),
      prisma.settlementBatch.count({
        where: { status: { in: ["pending", "submitted"] } },
      }),
      prisma.settlementBatch.count({ where: { status: "confirmed" } }),
      prisma.agent.count({ where: { status: "active" } }),
    ]);

  // Reserve lag: accrued offchain vs reserved onchain (sample first agent).
  let reserveLag: string | null = null;
  const sampleAgent = await prisma.agent.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (sampleAgent && contractReachable) {
    try {
      const accrued = await prisma.usageRecord.aggregate({
        where: {
          agentId: sampleAgent.id,
          status: { in: ["pending", "accrued", "settling"] },
        },
        _sum: { price: true },
      });
      const reservedOnchain = (await getPublicClient().readContract({
        address: contract!,
        abi: [
          {
            type: "function",
            name: "reservedOf",
            stateMutability: "view",
            inputs: [{ name: "agent", type: "address" }],
            outputs: [{ name: "", type: "uint256" }],
          },
        ] as const,
        functionName: "reservedOf",
        args: [sampleAgent.walletAddress as `0x${string}`],
      })) as bigint;
      const lag = (accrued._sum.price ?? 0n) - reservedOnchain;
      reserveLag = (lag > 0n ? lag : 0n).toString();
    } catch {
      reserveLag = null;
    }
  }

  const network =
    chainId === ARC_TESTNET_ID
      ? "arc-testnet"
      : chainId === ARC_MAINNET_ID
        ? "arc-mainnet"
        : chainId === 31337
          ? "local-anvil"
          : `chain-${chainId}`;

  return NextResponse.json({
    network,
    chainId,
    contractAddress: contract,
    contractReachable,
    providerAddress: provider,
    operatorConfigured: hasOperatorCredentials(),
    settleThresholdCalls: SETTLE_THRESHOLD_CALLS,
    reserveSyncThreshold: RESERVE_SYNC_THRESHOLD.toString(),
    pricePerRequest: PRICE_PER_REQUEST.toString(),
    priceDecimals: 6,
    batches: {
      failed: failedBatches,
      inFlight: pendingBatches,
      confirmed: confirmedBatches,
    },
    activeAgents: agents,
    reserveLagBaseUnits: reserveLag,
    health: {
      ready: Boolean(contract && contractReachable && hasOperatorCredentials()),
      warnings: [
        ...(failedBatches > 0
          ? [`${failedBatches} failed settlement batch(es) need retry`]
          : []),
        ...(reserveLag && BigInt(reserveLag) > 0n
          ? [`Reserve sync lag: ${reserveLag} base units not yet locked onchain`]
          : []),
        ...(!contract ? ["LYNTO_CONTRACT_ADDRESS not set"] : []),
        ...(contract && !contractReachable
          ? ["Contract unreachable — is the chain RPC running?"]
          : []),
        ...(!hasOperatorCredentials()
          ? ["OPERATOR_PRIVATE_KEY not configured — settlements disabled"]
          : []),
      ],
    },
  });
}
