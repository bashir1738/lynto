"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

/**
 * RainbowKit connect button, styled to sit cleanly in the header.
 * Network switching and balance display come from RainbowKit defaults.
 */
export function WalletConnect() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-28 rounded-xl border-2 border-black/10 bg-black/5 animate-pulse" />
    );
  }

  return (
    <div className="rk-connect">
      <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
    </div>
  );
}
