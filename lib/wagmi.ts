"use client";

import { http } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arc, arcTestnet, ARC_MAINNET_ID, ARC_TESTNET_ID } from "./arc";

export const config = getDefaultConfig({
  appName: "Lynto",
  // WalletConnect Cloud projectId (32-char hex). Replace in production via env.
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
    "a1b2c3d4e5f60718293a4b5c6d7e8f90",
  chains: [arc, arcTestnet],
  transports: {
    [ARC_MAINNET_ID]: http("https://rpc.mainnet.arc.io"),
    [ARC_TESTNET_ID]: http("https://rpc.testnet.arc.io"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
