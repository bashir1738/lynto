// Arc network configuration (mainnet + testnet)
// Verified from official Arc docs: https://docs.arc.io

import { defineChain } from "viem";

export const ARC_MAINNET_ID = 5042;
export const ARC_TESTNET_ID = 5042002;

/** Official Arc mainnet chain definition for viem/wagmi. */
export const arc = defineChain({
  id: ARC_MAINNET_ID,
  caipNetworkId: "eip155:5042",
  chainNamespace: "eip155",
  name: "Arc",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
  testnet: false,
});

/** Official Arc testnet chain definition. */
export const arcTestnet = defineChain({
  id: ARC_TESTNET_ID,
  caipNetworkId: "eip155:5042002",
  chainNamespace: "eip155",
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

/**
 * USDC ERC-20 interface address on Arc.
 * Native USDC is the gas token (18 decimals for gas); the ERC-20 interface
 * at this address uses 6 decimals and supports transfer/approve/transferFrom.
 * Verified from Circle/Arc docs. Same address on mainnet and testnet.
 */
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const USDC_DECIMALS = 6;

export const EXPLORER_URLS = {
  [ARC_MAINNET_ID]: "https://explorer.arc.io",
  [ARC_TESTNET_ID]: "https://explorer.testnet.arc.io",
} as const;

export function explorerTxUrl(hash: string, chainId?: number): string {
  const base =
    chainId === ARC_TESTNET_ID
      ? EXPLORER_URLS[ARC_TESTNET_ID]
      : EXPLORER_URLS[ARC_MAINNET_ID];
  return `${base}/tx/${hash}`;
}

export function explorerAddressUrl(address: string, chainId?: number): string {
  const base =
    chainId === ARC_TESTNET_ID
      ? EXPLORER_URLS[ARC_TESTNET_ID]
      : EXPLORER_URLS[ARC_MAINNET_ID];
  return `${base}/address/${address}`;
}

export function getRpcUrl(chainId?: number): string {
  return chainId === ARC_TESTNET_ID
    ? "https://rpc.testnet.arc.io"
    : "https://rpc.mainnet.arc.io";
}

/** Supported chain IDs for wallet switching. */
export const SUPPORTED_CHAIN_IDS = [ARC_MAINNET_ID, ARC_TESTNET_ID] as const;
