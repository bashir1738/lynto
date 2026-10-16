// Onchain settlement: batch creation, transaction submission, confirmation,
// and reconciliation against contract events.

import { createHash, randomUUID } from "crypto";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prisma } from "./db";
import {
  arc,
  arcTestnet,
  ARC_MAINNET_ID,
  ARC_TESTNET_ID,
  USDC_ADDRESS,
} from "./arc";
import { LYNTO_PAYMENTS_ABI } from "./contract";

// ---------------------------------------------------------------------------
// Chain / client helpers
// ---------------------------------------------------------------------------

export function getChain() {
  const chainId = parseInt(process.env.ARC_CHAIN_ID ?? "5042", 10);
  if (chainId === ARC_TESTNET_ID) return arcTestnet;
  if (chainId === 31337) {
    // Local anvil / hardhat
    return {
      ...arc,
      id: 31337,
      name: "Local Anvil",
      rpcUrls: {
        default: {
          http: [process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545"],
        },
      },
    } as unknown as typeof arc;
  }
  return arc;
}

export function getPublicClient() {
  const chain = getChain();
  return createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });
}

export function getContractAddress(): `0x${string}` | undefined {
  const addr = process.env.LYNTO_CONTRACT_ADDRESS;
  return addr ? (addr as `0x${string}`) : undefined;
}

export function getOperatorWalletClient() {
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!key) return null;
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  const account = privateKeyToAccount(normalized as Hex);
  const chain = getChain();
  return createWalletClient({
    account,
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });
}

// ---------------------------------------------------------------------------
// Onchain reads
// ---------------------------------------------------------------------------

export interface OnchainBalances {
  balance: bigint;
  reserved: bigint;
  available: bigint;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  totalSettled: bigint;
}

export async function getOnchainBalances(
  agentAddress: string
): Promise<OnchainBalances> {
  const client = getPublicClient();
  const contract = getContractAddress();
  if (!contract) throw new Error("LYNTO_CONTRACT_ADDRESS not set");

  const [balance, reserved, available, totalDeposited, totalWithdrawn, totalSettled] =
    await Promise.all([
      client.readContract({
        address: contract,
        abi: LYNTO_PAYMENTS_ABI,
        functionName: "balanceOf",
        args: [agentAddress as `0x${string}`],
      }),
      client.readContract({
        address: contract,
        abi: LYNTO_PAYMENTS_ABI,
        functionName: "reservedOf",
        args: [agentAddress as `0x${string}`],
      }),
      client.readContract({
        address: contract,
        abi: LYNTO_PAYMENTS_ABI,
        functionName: "availableOf",
        args: [agentAddress as `0x${string}`],
      }),
      client.readContract({
        address: contract,
        abi: LYNTO_PAYMENTS_ABI,
        functionName: "totalDeposited",
        args: [agentAddress as `0x${string}`],
      }),
      client.readContract({
        address: contract,
        abi: LYNTO_PAYMENTS_ABI,
        functionName: "totalWithdrawn",
        args: [agentAddress as `0x${string}`],
      }),
      client.readContract({
        address: contract,
        abi: LYNTO_PAYMENTS_ABI,
        functionName: "totalSettled",
        args: [agentAddress as `0x${string}`],
      }),
    ]);

  return {
    balance: balance as bigint,
    reserved: reserved as bigint,
    available: available as bigint,
    totalDeposited: totalDeposited as bigint,
    totalWithdrawn: totalWithdrawn as bigint,
    totalSettled: totalSettled as bigint,
  };
}

// ---------------------------------------------------------------------------
// Batch creation & settlement
// ---------------------------------------------------------------------------

function batchIdFromRandom(): `0x${string}` {
  const uuid = randomUUID();
  return `0x${createHash("sha256").update(uuid).digest("hex")}`;
}

/**
 * Create a settlement batch from eligible unsettled usage records and
 * submit the onchain settle transaction as the authorized operator.
 *
 * Flow:
 *  1. Identify eligible unsettled usage records (status=accrued).
 *  2. Calculate amount using integer USDC units.
 *  3. Generate a unique batch ID.
 *  4. Prevent the same records from entering another batch (DB claim).
 *  5. Submit settle() through the operator.
 *  6. Wait for a successful receipt.
 *  7. Mark batch confirmed only after confirmation.
 *  8. Store tx hash and reconcile.
 */
export async function createAndExecuteSettlement(agentId: string): Promise<
  | {
      ok: true;
      batchId: string;
      amount: bigint;
      requestCount: number;
      txHash: string;
      status: string;
    }
  | { ok: false; error: string }
> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { ok: false, error: "Agent not found" };

  const client = getOperatorWalletClient();
  if (!client) return { ok: false, error: "Operator private key not configured" };

  const contract = getContractAddress();
  if (!contract) return { ok: false, error: "Contract address not configured" };

  // Claim eligible accrued records atomically.
  const eligible = await prisma.$transaction(async (tx) => {
    const records = await tx.usageRecord.findMany({
      where: { agentId, status: "accrued" },
      orderBy: { createdAt: "asc" },
      take: 10_000,
    });
    if (!records.length) return [];

    const amount = records.reduce((sum, r) => sum + r.price, 0n);
    const batchOnchainId = batchIdFromRandom();

    const batch = await tx.settlementBatch.create({
      data: {
        batchId: batchOnchainId,
        agentId,
        amount,
        requestCount: records.length,
        status: "pending",
      },
    });

    // Claim records: move to settling state (distinct from initial "pending").
    await tx.usageRecord.updateMany({
      where: { id: { in: records.map((r) => r.id) } },
      data: { status: "settling", settlementId: batch.id, batchId: batchOnchainId },
    });

    return [{ batch, amount, count: records.length, recordIds: records.map((r) => r.id) }];
  }).then((r) => r[0]);

  if (!eligible) return { ok: false, error: "No eligible usage records" };

  const { batch, amount, count } = eligible;

  // Submit onchain settle.
  try {
    const chain = getChain();
    const publicClient = getPublicClient();

    await prisma.settlementBatch.update({
      where: { id: batch.id },
      data: { status: "submitted", submittedAt: new Date() },
    });

  const hash = await client.writeContract({
    address: contract,
    abi: [
      {
        type: "function",
        name: "settle",
        stateMutability: "nonpayable",
        inputs: [
          { name: "agent", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "batchId", type: "bytes32" },
        ],
        outputs: [],
      },
    ] as const,
    functionName: "settle",
    args: [
      agent.walletAddress as `0x${string}`,
      amount,
      batch.batchId as `0x${string}`,
    ],
    account: client.account,
    chain,
  });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
      await prisma.settlementBatch.update({
        where: { id: batch.id },
        data: { status: "failed", errorMessage: "Transaction reverted onchain" },
      });
      // Release claimed records back to accrued for retry.
      await prisma.usageRecord.updateMany({
        where: { settlementId: batch.id },
        data: { status: "accrued", settlementId: null, batchId: null },
      });
      return { ok: false, error: "Settlement transaction reverted" };
    }

    // Mark confirmed and settle records.
    await prisma.$transaction([
      prisma.settlementBatch.update({
        where: { id: batch.id },
        data: { status: "confirmed", txHash: hash, confirmedAt: new Date() },
      }),
      prisma.usageRecord.updateMany({
        where: { settlementId: batch.id },
        data: { status: "settled", settledAt: new Date() },
      }),
    ]);

    return {
      ok: true,
      batchId: batch.batchId,
      amount,
      requestCount: count,
      txHash: hash,
      status: "confirmed",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Settlement failed";
    await prisma.settlementBatch.update({
      where: { id: batch.id },
      data: { status: "failed", errorMessage: message.slice(0, 500) },
    });
    await prisma.usageRecord.updateMany({
      where: { settlementId: batch.id },
      data: { status: "accrued", settlementId: null, batchId: null },
    });
    return { ok: false, error: message };
  }
}

/** Check whether auto-settlement should trigger for an agent. */
export async function shouldAutoSettle(agentId: string): Promise<boolean> {
  const { SETTLE_THRESHOLD_CALLS } = await import("./metering");
  const accrued = await prisma.usageRecord.count({
    where: { agentId, status: "accrued" },
  });
  return accrued >= SETTLE_THRESHOLD_CALLS;
}

/**
 * Reconcile offchain records against onchain settlement events.
 * Fetches Settled events for the agent and compares with DB batches.
 */
export async function reconcileAgent(agentId: string): Promise<{
  onchainSettled: bigint;
  dbSettled: bigint;
  matched: boolean;
  events: Array<{ batchId: string; amount: bigint; txHash?: string }>;
}> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error("Agent not found");

  const client = getPublicClient();
  const contract = getContractAddress();
  if (!contract) throw new Error("Contract not configured");

  const logs = await client.getContractEvents({
    address: contract,
    abi: LYNTO_PAYMENTS_ABI,
    eventName: "Settled",
    args: { agent: agent.walletAddress as `0x${string}` },
    fromBlock: 0n,
    toBlock: "latest",
  });

  let onchainSettled = 0n;
  const events = logs.map((log) => {
    const args = log.args as { amount: bigint; batchId: string };
    onchainSettled += args.amount;
    return {
      batchId: args.batchId,
      amount: args.amount,
      txHash: log.transactionHash,
    };
  });

  const confirmed = await prisma.settlementBatch.aggregate({
    where: { agentId, status: "confirmed" },
    _sum: { amount: true },
  });
  const dbSettled = confirmed._sum.amount ?? 0n;

  return {
    onchainSettled,
    dbSettled,
    matched: onchainSettled === dbSettled,
    events,
  };
}

// ---------------------------------------------------------------------------
// USDC helpers
// ---------------------------------------------------------------------------

export async function getUsdcAllowance(
  owner: string,
  spender: string
): Promise<bigint> {
  const client = getPublicClient();
  return (await client.readContract({
    address: USDC_ADDRESS,
    abi: [
      {
        type: "function",
        name: "allowance",
        stateMutability: "view",
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
      },
    ] as const,
    functionName: "allowance",
    args: [owner as `0x${string}`, spender as `0x${string}`],
  })) as bigint;
}

export async function getUsdcBalance(owner: string): Promise<bigint> {
  const client = getPublicClient();
  return (await client.readContract({
    address: USDC_ADDRESS,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ] as const,
    functionName: "balanceOf",
    args: [owner as `0x${string}`],
  })) as bigint;
}

export { ARC_MAINNET_ID, ARC_TESTNET_ID, USDC_ADDRESS };
