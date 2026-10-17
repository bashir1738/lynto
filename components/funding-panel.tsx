"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useWaitForTransactionReceipt,
  useReadContract,
  useWriteContract,
} from "wagmi";
import {
  USDC_ADDRESS,
  USDC_DECIMALS,
  ARC_MAINNET_ID,
  ARC_TESTNET_ID,
  explorerTxUrl,
} from "@/lib/arc";
import {
  LYNTO_PAYMENTS_ABI,
  ERC20_ABI,
  getContractAddress,
} from "@/lib/contract";
import { shortAddress, parseUsdc, formatUsdc } from "@/lib/utils";

export function FundingPanel({
  agentWalletAddress,
}: {
  agentWalletAddress?: string;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress();

  const [amount, setAmount] = useState("1");
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [error, setError] = useState<string | null>(null);

  const targetAddress = (agentWalletAddress ?? address) as `0x${string}` | undefined;

  // Reads
  const { data: walletUsdc, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && contractAddress ? [address, contractAddress] : undefined,
    query: { enabled: Boolean(address && contractAddress) },
  });

  const { data: prepaidBalance, refetch: refetchBalance } = useReadContract({
    address: contractAddress,
    abi: LYNTO_PAYMENTS_ABI,
    functionName: "balanceOf",
    args: targetAddress ? [targetAddress] : undefined,
    query: { enabled: Boolean(contractAddress && targetAddress) },
  });

  const { data: available, refetch: refetchAvailable } = useReadContract({
    address: contractAddress,
    abi: LYNTO_PAYMENTS_ABI,
    functionName: "availableOf",
    args: targetAddress ? [targetAddress] : undefined,
    query: { enabled: Boolean(contractAddress && targetAddress) },
  });

  const { data: reserved, refetch: refetchReserved } = useReadContract({
    address: contractAddress,
    abi: LYNTO_PAYMENTS_ABI,
    functionName: "reservedOf",
    args: targetAddress ? [targetAddress] : undefined,
    query: { enabled: Boolean(contractAddress && targetAddress) },
  });

  const { data: withdrawalReq, refetch: refetchWithdrawal } = useReadContract({
    address: contractAddress,
    abi: LYNTO_PAYMENTS_ABI,
    functionName: "withdrawalRequestOf",
    args: targetAddress ? [targetAddress] : undefined,
    query: { enabled: Boolean(contractAddress && targetAddress) },
  });

  const { data: withdrawDelay } = useReadContract({
    address: contractAddress,
    abi: LYNTO_PAYMENTS_ABI,
    functionName: "withdrawDelay",
    query: { enabled: Boolean(contractAddress) },
  });

  // Writes
  const {
    writeContract,
    data: txHash,
    isPending: isWriting,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
      query: {
        enabled: Boolean(txHash),
      },
    });

  // Track which action we're performing so we can refresh after confirm.
  const [lastAction, setLastAction] = useState<
    "approve" | "deposit" | "withdraw" | null
  >(null);

  // Two-step withdrawal state: (amount, executeAfter); executeAfter = 0 → none.
  const withdrawalTuple = withdrawalReq as readonly [bigint, bigint] | undefined;
  const pendingWithdrawAmount = withdrawalTuple?.[0] ?? 0n;
  const executeAfter = withdrawalTuple?.[1] ?? 0n;
  const hasPendingWithdraw = executeAfter > 0n;
  const withdrawReady =
    hasPendingWithdraw &&
    BigInt(Math.floor(Date.now() / 1000)) >= executeAfter;

  async function refreshAll() {
    await Promise.all([
      refetchUsdc(),
      refetchAllowance(),
      refetchBalance(),
      refetchAvailable(),
      refetchReserved(),
      refetchWithdrawal(),
    ]);
  }

  // Auto-refresh after confirmation.
  useEffect(() => {
    if (isConfirmed && lastAction) {
      void refreshAll();
      const t = setTimeout(() => {
        setLastAction(null);
        reset();
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [isConfirmed, lastAction]);

  function onApprove() {
    setError(null);
    if (!contractAddress) {
      setError("Contract address not configured.");
      return;
    }
    const value = parseUsdc(amount || "0");
    if (value <= 0n) {
      setError("Enter a positive amount.");
      return;
    }
    setLastAction("approve");
    writeContract(
      {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [contractAddress, value],
      },
      { onError: (e) => setError(e.message) }
    );
  }

  function onDeposit() {
    setError(null);
    if (!contractAddress) {
      setError("Contract address not configured.");
      return;
    }
    const value = parseUsdc(amount || "0");
    if (value <= 0n) {
      setError("Enter a positive amount.");
      return;
    }
    setLastAction("deposit");
    writeContract(
      {
        address: contractAddress,
        abi: LYNTO_PAYMENTS_ABI,
        functionName: "deposit",
        args: [value],
      },
      { onError: (e) => setError(e.message) }
    );
  }

  function onWithdraw() {
    setError(null);
    if (!contractAddress) {
      setError("Contract address not configured.");
      return;
    }
    // Step 2: a matured request can be executed.
    if (hasPendingWithdraw) {
      if (!withdrawReady) {
        setError(
          `Withdrawal is still in its security delay — unlocks at ${new Date(
            Number(executeAfter) * 1000
          ).toLocaleTimeString()}.`
        );
        return;
      }
      setLastAction("withdraw");
      writeContract(
        {
          address: contractAddress,
          abi: LYNTO_PAYMENTS_ABI,
          functionName: "executeWithdraw",
        },
        { onError: (e) => setError(e.message) }
      );
      return;
    }
    // Step 1: queue the withdrawal (enforced against availableOf onchain).
    const value = parseUsdc(amount || "0");
    if (value <= 0n) {
      setError("Enter a positive amount.");
      return;
    }
    setLastAction("withdraw");
    writeContract(
      {
        address: contractAddress,
        abi: LYNTO_PAYMENTS_ABI,
        functionName: "requestWithdraw",
        args: [value],
      },
      { onError: (e) => setError(e.message) }
    );
  }

  async function prepWithdraw() {
    setError(null);
    try {
      const res = await fetch("/api/withdraw-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: targetAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Withdraw prep failed");
        return;
      }
      // Show exact available amount.
      setAmount(formatUsdc(data.available, USDC_DECIMALS));
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdraw prep failed");
    }
  }

  const needsApproval =
    mode === "deposit" &&
    allowance !== undefined &&
    parseUsdc(amount || "0") > (allowance as bigint);

  if (!isConnected) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900">Funding</h3>
        <p className="mt-2 text-sm text-slate-500">
          Connect a wallet to deposit or withdraw USDC.
        </p>
      </div>
    );
  }

  if (!contractAddress) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-900">Funding</h3>
        <p className="mt-2 text-sm text-amber-700">
          Contract address not configured. Deploy LyntoPayments and set
          NEXT_PUBLIC_LYNTO_CONTRACT_ADDRESS.
        </p>
      </div>
    );
  }

  const wrongNetwork =
    chainId !== ARC_MAINNET_ID && chainId !== ARC_TESTNET_ID;

  return (
    <div className="rounded-3xl border border-[#EAE7DE] bg-white p-7 shadow-[0_4px_20px_-2px_rgba(28,25,23,0.04)]">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight text-[#191A16]">
            Smart Escrow Funding
          </h3>
          <p className="text-xs text-[#73766D] mt-0.5">
            Non-custodial deposit &amp; withdrawal via Arc L1
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-2xl bg-[#F5F4EE] border border-[#EAE7DE]">
          <button
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              mode === "deposit"
                ? "bg-[#FCFF52] text-[#0A0A0A] shadow-xs font-bold border border-[#0A0A0A]/10"
                : "text-[#666960] hover:text-[#191A16]"
            }`}
            onClick={() => setMode("deposit")}
          >
            Deposit
          </button>
          <button
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              mode === "withdraw"
                ? "bg-[#FCFF52] text-[#0A0A0A] shadow-xs font-bold border border-[#0A0A0A]/10"
                : "text-[#666960] hover:text-[#191A16]"
            }`}
            onClick={() => setMode("withdraw")}
          >
            Withdraw
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Wallet USDC</dt>
          <dd className="mono font-medium">
            {walletUsdc !== undefined
              ? `${formatUsdc(walletUsdc as bigint)} USDC`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Prepaid balance</dt>
          <dd className="mono font-medium">
            {prepaidBalance !== undefined
              ? `${formatUsdc(prepaidBalance as bigint)} USDC`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Available (withdrawable)</dt>
          <dd className="mono font-medium">
            {available !== undefined
              ? `${formatUsdc(available as bigint)} USDC`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Reserved (accrued usage)</dt>
          <dd className="mono font-medium">
            {reserved !== undefined
              ? `${formatUsdc(reserved as bigint)} USDC`
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <label className="stat-label" htmlFor="fund-amount">
          Amount (USDC)
        </label>
        <input
          id="fund-amount"
          className="input mt-1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />
        <p className="mt-1 text-xs text-slate-500">
          Exact value:{" "}
          <span className="mono">
            {(() => {
              try {
                return `${parseUsdc(amount || "0").toString()} base units (${USDC_DECIMALS} decimals)`;
              } catch {
                return "—";
              }
            })()}
          </span>
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {txHash && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
          Tx:{" "}
          <a
            className="text-accent underline"
            href={explorerTxUrl(txHash, chainId)}
            target="_blank"
            rel="noreferrer"
          >
            {shortAddress(txHash, 8)}
          </a>{" "}
          {isConfirming ? "(confirming…)" : isConfirmed ? "(confirmed ✓)" : ""}
        </p>
      )}

      {mode === "withdraw" && hasPendingWithdraw && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
          Pending withdrawal:{" "}
          <span className="mono">{formatUsdc(pendingWithdrawAmount)} USDC</span>{" "}
          {withdrawReady
            ? "— delay elapsed, ready to execute."
            : `— unlocks at ${new Date(
                Number(executeAfter) * 1000
              ).toLocaleTimeString()} (default 10 min delay).`}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {mode === "deposit" ? (
          <>
            {needsApproval && (
              <button className="btn-secondary" onClick={onApprove} disabled={isWriting || isConfirming}>
                Approve USDC
              </button>
            )}
            <button
              className="btn-primary"
              onClick={onDeposit}
              disabled={isWriting || isConfirming || needsApproval}
            >
              {isWriting || isConfirming ? "Submitting…" : "Deposit"}
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={prepWithdraw} disabled={isWriting || isConfirming}>
              Sync & show available
            </button>
            <button
              className="btn-primary"
              onClick={onWithdraw}
              disabled={
                isWriting ||
                isConfirming ||
                (hasPendingWithdraw && !withdrawReady)
              }
            >
              {isWriting || isConfirming
                ? "Submitting…"
                : hasPendingWithdraw
                  ? withdrawReady
                    ? "Execute withdrawal"
                    : "Withdrawal pending…"
                  : "Request withdrawal"}
            </button>
          </>
        )}
      </div>

      {wrongNetwork && (
        <p className="mt-3 text-xs text-amber-700">
          You are not on Arc. Switch your wallet to Arc mainnet (chain 5042).
        </p>
      )}
    </div>
  );
}
