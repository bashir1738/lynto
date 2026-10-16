"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function HomePage() {
  const [activeCodeTab, setActiveCodeTab] = useState<"ts" | "curl" | "py" | "sol">("ts");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [liveTesting, setLiveTesting] = useState(false);
  const [liveResult, setLiveResult] = useState<any | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Live Interactive Simulator State ──
  const [requestCount, setRequestCount] = useState<number>(148920);
  const [isFiring, setIsFiring] = useState<boolean>(false);
  const [lastLatency, setLastLatency] = useState<string>("2.1ms");
  const [lastRequestId, setLastRequestId] = useState<string>("req_8f1a09d2");

  // ── Interactive Pipeline Active Stage ──
  const [activePipelineStep, setActivePipelineStep] = useState<number>(0);

  // ── Interactive Unit Economics Slider State ──
  const [dailyVolume, setDailyVolume] = useState<number>(25000);

  // Simulate firing an autonomous API call
  const handleFireQuery = () => {
    setIsFiring(true);
    const newCount = requestCount + 1;
    setRequestCount(newCount);
    const latency = (Math.random() * 0.9 + 1.6).toFixed(1) + "ms";
    setLastLatency(latency);
    const hex = Math.random().toString(16).substring(2, 10);
    setLastRequestId(`req_${hex}`);

    setTimeout(() => {
      setIsFiring(false);
    }, 1200);
  };

  const handleCopy = (text: string, tab: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tab);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const handleTestApi = async () => {
    setLiveTesting(true);
    try {
      const res = await fetch("/api/paid-data");
      const json = await res.json();
      setLiveResult(json);
    } catch (e: any) {
      setLiveResult({ error: e.message || "Failed to reach endpoint" });
    } finally {
      setLiveTesting(false);
    }
  };

  // Calculations for Unit Economics Slider
  const gasSavedPerMonth = ((dailyVolume * 30 * 0.08) - (30 * 0.002)).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const traditionalGasPerMonth = (dailyVolume * 30 * 0.08).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const lyntoCostPerMonth = (30 * 0.002).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
  });
  const hoursSavedPerMonth = Math.round((dailyVolume * 30 * 4.5) / 3600).toLocaleString();

  const codeSnippets = {
    ts: `import { LyntoAgent } from "@lynto/sdk";

// 1. Initialize autonomous agent identity with Arc escrow
const agent = new LyntoAgent({
  walletAddress: "0x71C836643F37711fa49b560ab921B7c062c389e2",
  endpoint: "https://lynto.app/api/paid-data",
});

// 2. Query paid intelligence with zero gas per call
const marketData = await agent.query({
  symbol: "ETH-USD",
  idempotencyKey: crypto.randomUUID(),
});

console.log("Verified Price:", marketData.priceUsd);
// Metered offchain in integer USDC. Settled automatically in batches.`,

    curl: `curl -X POST https://lynto.app/api/paid-data \\
  -H "Content-Type: application/json" \\
  -H "x-agent-address: 0x71C836643F37711fa49b560ab921B7c062c389e2" \\
  -H "x-request-id: req_$(openssl rand -hex 8)" \\
  -d '{"symbol": "ETH-USD"}'`,

    py: `import httpx, uuid

# Autonomous agent query loop with idempotency key
async def query_market_intelligence():
    headers = {
        "x-agent-address": "0x71C836643F37711fa49b560ab921B7c062c389e2",
        "x-request-id": f"req_{uuid.uuid4()}",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://lynto.app/api/paid-data", headers=headers)
        return resp.json()`,

    sol: `// SPDX-License-Identifier: MIT
interface ILyntoPayments {
    // 1. Owner deposits prepaid USDC escrow for an agent
    function deposit(address agent, uint256 amount) external;

    // 2. Operator consolidates 10,000 offchain queries in 1 Arc transaction
    function settle(
        address agent,
        uint256 amount,
        bytes32 batchId
    ) external;

    // 3. Agent owner retains instant permissionless withdrawal anytime
    function withdraw(uint256 amount) external;
}`,
  };

  const faqs = [
    {
      q: "How does Lynto prevent autonomous agents from overspending?",
      a: "Every agent operates strictly against a non-custodial prepaid balance deposited into the LyntoPayments contract. The metering engine checks available funds before authorizing each API call. If the prepaid balance drops below the request fee, further calls are rejected immediately.",
    },
    {
      q: "What happens if an API call fails or times out?",
      a: "Failed API requests are never charged. Lynto only meters HTTP 200 responses. Furthermore, network retries with identical `x-request-id` headers return cached responses without deducting funds again.",
    },
    {
      q: "How does batched settlement prevent double charges?",
      a: "Each settlement transaction on Arc commits a cryptographic unique batch ID generated from the accrued usage ledger. The smart contract validates that this batch ID has never been settled previously before transferring USDC.",
    },
    {
      q: "Can an agent owner withdraw deposited funds at any time?",
      a: "Yes. Any unreserved deposited USDC can be withdrawn immediately by calling withdraw(amount) on the Arc smart contract without requiring permission or intervention from the service provider.",
    },
    {
      q: "Why is Lynto built natively on Circle's Arc network?",
      a: "Arc is Circle's USDC-native EVM Layer 1 where USDC is the native gas token. This removes gas token volatility, eliminating the need to hold separate ETH/MATIC/SOL just to pay settlement transaction fees.",
    },
  ];

  const pipelineStages = [
    {
      id: "01",
      title: "Prepaid Smart Escrow",
      category: "Arc Non-Custodial Contract",
      desc: "Agent owner deposits USDC into the LyntoPayments contract on Arc Layer 1. Balance is verifiable onchain, with instant withdrawal rights preserved 24/7.",
      code: "contract.deposit(agentWallet, 50.00 USDC)",
      badge: "Onchain Verified",
    },
    {
      id: "02",
      title: "Zero-Gas In-Memory Metering",
      category: "Nanosecond Execution",
      desc: "Autonomous bots query protected APIs with an x-request-id header. Lynto's memory engine checks balance and logs debits in <3ms with zero gas burned.",
      code: "HTTP 200 OK · Latency: 2.1ms · Gas: $0.00",
      badge: "< 3ms Latency",
    },
    {
      id: "03",
      title: "Cryptographic Batch Ledger",
      category: "Idempotent Aggregation",
      desc: "Accrued microcents accumulate offchain into cryptographically signed batch digests. Repeated retries with identical request IDs return cached output with zero double-billing.",
      code: "ledger.accumulate(req_uuid, 0.005 USDC)",
      badge: "Zero Drift",
    },
    {
      id: "04",
      title: "Consolidated Arc Settlement",
      category: "Circle Arc L1 Finality",
      desc: "When threshold hits ($50 or 12h), 10,000 queries transfer USDC in 1 single onchain Arc settlement transaction, unlocking 99.9% gas savings.",
      code: "contract.settle(batch_0x8f2a, 10000_calls)",
      badge: "10,000 : 1 Ratio",
    },
  ];

  return (
    <div className="w-full min-h-screen bg-[#FAF9F5] text-[#191A16] font-sans overflow-x-hidden selection:bg-[#F6E469] selection:text-[#191A16]">
      {/* ── Hero Section (Neon Yellow Background + 3D Rolling "Lynto" Cube) ── */}
      <section className="relative w-full bg-celo-yellow text-[#191A16] border-b border-[#EAE7DE] py-20 sm:py-28 lg:py-36 flex flex-col items-center justify-center overflow-hidden">
        {/* Subtle grid pattern overlay */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-15"
          style={{
            backgroundImage: "radial-gradient(#000000 1.2px, transparent 1.2px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto">
          {/* 3D Rolling Cube Scene */}
          <div className="cube-scene py-4 select-none cursor-grab active:cursor-grabbing">
            <div className="cube-wrapper">
              {/* Front Face */}
              <div className="cube-face cube-face-front border-4 border-black flex items-center justify-center">
                <span className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-celo-yellow uppercase select-none">
                  Lynto
                </span>
              </div>

              {/* Back Face */}
              <div className="cube-face cube-face-back border-4 border-black flex items-center justify-center">
                <span className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-celo-yellow uppercase select-none">
                  Lynto
                </span>
              </div>

              {/* Right Face */}
              <div className="cube-face cube-face-right border-4 border-black flex items-center justify-center">
                <span className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-celo-yellow uppercase select-none">
                  Lynto
                </span>
              </div>

              {/* Left Face */}
              <div className="cube-face cube-face-left border-4 border-black flex items-center justify-center">
                <span className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-celo-yellow uppercase select-none">
                  Lynto
                </span>
              </div>

              {/* Top Face */}
              <div className="cube-face cube-face-top border-4 border-black flex items-center justify-center">
                <span className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-celo-yellow uppercase select-none">
                  Lynto
                </span>
              </div>

              {/* Bottom Face */}
              <div className="cube-face cube-face-bottom border-4 border-black flex items-center justify-center">
                <span className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-celo-yellow uppercase select-none">
                  Lynto
                </span>
              </div>
            </div>
          </div>

          {/* Cast Shadow on the neon yellow floor */}
          <div className="w-52 sm:w-68 lg:w-80 h-7 sm:h-9 bg-black/25 rounded-full blur-xl mx-auto mt-12 sm:mt-16 animate-pulse-slow scale-y-75" />

          {/* Minimalist Action Controls */}
          <div className="mt-10 sm:mt-12 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#16221C] px-8 py-4 text-sm font-bold text-[#F6E469] hover:bg-[#202E27] shadow-comfort transition-all active:scale-[0.98]"
            >
              <span>Launch Dashboard</span>
              <span className="font-mono">→</span>
            </Link>

            <Link
              href="/agents"
              className="inline-flex items-center gap-2 rounded-2xl border border-black/20 bg-black/5 px-8 py-4 text-sm font-bold text-[#191A16] hover:bg-black/10 transition-colors"
            >
              <span>Manage Agents</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Sticky Header / Navbar (Positioned Below the Hero Section) ── */}
      <nav className="sticky top-0 z-40 border-b border-[#EAE7DE] bg-[#FAF9F5]/90 backdrop-blur-md text-[#191A16] shadow-xs">
        <div className="mx-auto flex h-16 max-w-7xl xl:max-w-[1400px] items-center justify-between px-6 sm:px-10 lg:px-12">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/images/lynto-L-black.svg"
              alt="Lynto Logo"
              className="h-8 w-auto object-contain group-hover:scale-105 transition-transform"
            />
            <div className="leading-tight flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-[#191A16]">Lynto</span>
              <span className="hidden sm:inline-block rounded-full bg-[#EAE7DE]/70 px-2.5 py-0.5 text-[10px] font-mono font-medium text-[#666960]">
                Arc L1
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-xs font-semibold text-[#55584F]">
            <a href="#how-it-works" className="hover:text-[#191A16] transition-colors">
              Architecture
            </a>
            <a href="#calculator" className="hover:text-[#191A16] transition-colors">
              ROI Calculator
            </a>
            <a href="#features" className="hover:text-[#191A16] transition-colors">
              Capabilities
            </a>
            <a href="#code" className="hover:text-[#191A16] transition-colors">
              Developer SDK
            </a>
            <a href="#faq" className="hover:text-[#191A16] transition-colors">
              FAQ
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/agents"
              className="hidden sm:inline-flex items-center rounded-2xl border border-[#EAE7DE] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#191A16] hover:bg-[#F5F4EE] hover:border-[#DDD9CD] transition-all shadow-xs"
            >
              Agents
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-[#FCFF52] px-4 py-1.5 text-xs font-bold text-[#0A0A0A] hover:bg-[#E8EB3A] border border-[#0A0A0A]/15 shadow-sm transition-all active:scale-[0.98]"
            >
              <span>Dashboard</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Key Protocol Metrics (Directly below Header, without slideshow) ── */}
      <section className="border-b border-[#EAE7DE] bg-[#FAF9F5] py-20">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#191A16]">
              Engineered for Zero Gas &amp; Nanosecond Settlement
            </h2>
            <p className="mt-2 text-sm text-[#73766D] leading-relaxed">
              Every design decision removes the friction of blockchains for autonomous software, while ensuring 100% onchain financial finality.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-[0_4px_20px_-2px_rgba(28,25,23,0.03)] hover:shadow-[0_10px_30px_-4px_rgba(28,25,23,0.07)] hover:border-[#DED9CD] transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#73766D]">
                  Gas Per API Call
                </span>
                <span className="rounded-full bg-[#FCFF52] px-2.5 py-0.5 text-[10px] font-bold text-[#0A0A0A] border border-[#0A0A0A]/10">
                  Zero Friction
                </span>
              </div>
              <div className="mt-4 text-4xl sm:text-5xl font-black text-[#191A16] tabular-nums tracking-tight">
                $0.00
              </div>
              <p className="mt-3 text-xs text-[#666960] leading-relaxed">
                Zero onchain transactions burned per request. Metered offchain in server memory.
              </p>
            </div>

            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-[0_4px_20px_-2px_rgba(28,25,23,0.03)] hover:shadow-[0_10px_30px_-4px_rgba(28,25,23,0.07)] hover:border-[#DED9CD] transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#73766D]">
                  Metering Latency
                </span>
                <span className="rounded-full bg-[#FCFF52] px-2.5 py-0.5 text-[10px] font-bold text-[#0A0A0A] border border-[#0A0A0A]/10">
                  Instantaneous
                </span>
              </div>
              <div className="mt-4 text-4xl sm:text-5xl font-black text-[#191A16] tabular-nums tracking-tight">
                &lt; 3ms
              </div>
              <p className="mt-3 text-xs text-[#666960] leading-relaxed">
                Autonomous agents never wait for block confirmations or wallet signers.
              </p>
            </div>

            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-[0_4px_20px_-2px_rgba(28,25,23,0.03)] hover:shadow-[0_10px_30px_-4px_rgba(28,25,23,0.07)] hover:border-[#DED9CD] transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#73766D]">
                  Settlement Ratio
                </span>
                <span className="rounded-full bg-[#F5F4EE] px-2.5 py-0.5 text-[10px] font-semibold text-[#55584F]">
                  Batched L1
                </span>
              </div>
              <div className="mt-4 text-4xl sm:text-5xl font-black text-[#191A16] tabular-nums tracking-tight">
                10,000:1
              </div>
              <p className="mt-3 text-xs text-[#666960] leading-relaxed">
                Consolidates 10,000 micro-transactions into 1 verified onchain Arc settlement.
              </p>
            </div>

            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-[0_4px_20px_-2px_rgba(28,25,23,0.03)] hover:shadow-[0_10px_30px_-4px_rgba(28,25,23,0.07)] hover:border-[#DED9CD] transition-all duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#73766D]">
                  Escrow Security
                </span>
                <span className="rounded-full bg-[#E8F5EC] px-2.5 py-0.5 text-[10px] font-semibold text-[#1E5637]">
                  Non-Custodial
                </span>
              </div>
              <div className="mt-4 text-4xl sm:text-5xl font-black text-[#191A16] tabular-nums tracking-tight">
                100%
              </div>
              <p className="mt-3 text-xs text-[#666960] leading-relaxed">
                Non-custodial smart escrow. Agent owners retain instant withdrawal rights anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Interactive 4-Stage Protocol Architecture ── */}
      <section id="how-it-works" className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12 py-24 scroll-mt-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F4EE] px-3.5 py-1 text-xs font-semibold text-[#55584F] border border-[#EAE7DE]">
              Protocol Architecture
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#191A16]">
              How Batched Arc Settlement Works
            </h2>
          </div>
          <p className="max-w-md text-sm text-[#73766D] leading-relaxed">
            Eliminating blockchain gas fees and block-latency during active AI agent runtime while preserving 100% smart contract finality at settlement.
          </p>
        </div>

        {/* 4 Interactive Clickable Cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pipelineStages.map((stage, idx) => {
            const isSelected = activePipelineStep === idx;
            return (
              <div
                key={stage.id}
                onClick={() => setActivePipelineStep(idx)}
                className={`rounded-3xl border p-7 cursor-pointer transition-all duration-300 relative ${
                  isSelected
                    ? "border-[#FCFF52] bg-[#FCFF52]/10 shadow-[0_8px_30px_-4px_rgba(252,255,82,0.3)] ring-2 ring-[#FCFF52]"
                    : "border-[#EAE7DE] bg-white hover:border-[#DED9CD] shadow-xs hover:shadow-soft"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-xl ${
                      isSelected
                        ? "bg-[#FCFF52] text-[#0A0A0A]"
                        : "bg-[#F5F4EE] text-[#55584F]"
                    }`}
                  >
                    {stage.id}
                  </span>
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#73766D]">
                    {stage.badge}
                  </span>
                </div>

                <h3 className="text-base font-bold text-[#191A16]">{stage.title}</h3>
                <p className="text-xs text-[#73766D] mt-1 font-medium">{stage.category}</p>
                <p className="mt-3 text-xs text-[#666960] leading-relaxed">{stage.desc}</p>

                <div className="mt-5 pt-4 border-t border-[#EAE7DE]/70 font-mono text-[11px] text-[#73766D] truncate">
                  <code>{stage.code}</code>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Interactive Unit Economics & ROI Calculator ── */}
      <section id="calculator" className="border-t border-[#EAE7DE] bg-[#F5F3EC]/70 py-24 scroll-mt-14">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-xs font-semibold text-[#55584F] border border-[#EAE7DE] shadow-xs">
              Cost &amp; Latency Simulator
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#191A16]">
              Calculate Your Agent Fleet&apos;s Savings
            </h2>
            <p className="mt-2 text-sm text-[#73766D] leading-relaxed">
              Drag the volume slider to compare traditional Web3 per-request transaction costs against Lynto&apos;s batched Layer 1 settlements.
            </p>
          </div>

          <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 sm:p-12 shadow-soft">
            {/* Slider Control */}
            <div className="max-w-2xl mx-auto mb-12">
              <div className="flex items-center justify-between text-sm font-semibold text-[#191A16] mb-3">
                <span>Daily API Query Volume:</span>
                <span className="font-mono text-lg font-bold text-[#191A16] bg-[#F5F4EE] px-3.5 py-1 rounded-xl border border-[#EAE7DE]">
                  {dailyVolume.toLocaleString()} requests / day
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="250000"
                step="1000"
                value={dailyVolume}
                onChange={(e) => setDailyVolume(Number(e.target.value))}
                className="w-full h-2.5 bg-[#EAE7DE] rounded-lg appearance-none cursor-pointer accent-[#16221C]"
              />
              <div className="flex justify-between text-xs font-mono text-[#73766D] mt-2">
                <span>1,000 / day</span>
                <span>50,000 / day</span>
                <span>150,000 / day</span>
                <span>250,000 / day</span>
              </div>
            </div>

            {/* Savings Comparison Cards */}
            <div className="grid gap-6 md:grid-cols-3">
              {/* Card 1: Traditional Web3 */}
              <div className="rounded-3xl border border-[#F5DDD7] bg-[#FDF6F4] p-7">
                <span className="text-xs font-mono font-semibold text-[#932F1A] uppercase tracking-wider block mb-2">
                  Traditional Web3 Tx
                </span>
                <div className="text-3xl font-extrabold text-[#7D2916] tabular-nums">
                  {traditionalGasPerMonth}
                </div>
                <p className="mt-2 text-xs text-[#73766D] leading-relaxed">
                  Estimated gas fees paid across {(dailyVolume * 30).toLocaleString()} individual onchain transactions every month.
                </p>
                <div className="mt-4 pt-4 border-t border-[#F5DDD7] text-xs font-mono text-[#932F1A]">
                  Latency: 2,000ms - 15,000ms block wait
                </div>
              </div>

              {/* Card 2: Lynto Protocol */}
              <div className="rounded-3xl border border-[#D4EBDC] bg-[#F2F8F4] p-7">
                <span className="text-xs font-mono font-semibold text-[#1E5637] uppercase tracking-wider block mb-2">
                  Lynto Batched Layer
                </span>
                <div className="text-3xl font-extrabold text-[#1E5637] tabular-nums">
                  {lyntoCostPerMonth}
                </div>
                <p className="mt-2 text-xs text-[#73766D] leading-relaxed">
                  Only 30 consolidated Arc settlement transactions required per month. Zero gas burned per individual API request.
                </p>
                <div className="mt-4 pt-4 border-t border-[#D4EBDC] text-xs font-mono text-[#1E5637]">
                  Latency: &lt; 3ms instantaneous
                </div>
              </div>

              {/* Card 3: Total Net Savings (Neon Yellow Highlight) */}
              <div className="rounded-3xl border-2 border-[#FCFF52] bg-[#FCFF52]/15 p-7 relative overflow-hidden shadow-soft">
                <span className="text-xs font-mono font-bold text-[#0A0A0A] uppercase tracking-wider block mb-2">
                  Your Net Monthly Savings
                </span>
                <div className="text-4xl font-extrabold text-[#0A0A0A] tabular-nums">
                  {gasSavedPerMonth}
                </div>
                <p className="mt-2 text-xs text-[#0A0A0A]/80 leading-relaxed font-medium">
                  + {hoursSavedPerMonth} hours of block-latency wait time eliminated for your autonomous bot fleet.
                </p>
                <div className="mt-4 pt-4 border-t border-[#0A0A0A]/15 text-xs font-mono font-bold text-[#0A0A0A]">
                  99.98% Total Fee Reduction
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bento Features Grid ── */}
      <section id="features" className="border-t border-[#EAE7DE] bg-[#FAF9F5] py-24 scroll-mt-14">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-xs font-semibold text-[#55584F] border border-[#EAE7DE] shadow-xs">
              Engineered for Autonomy
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#191A16]">
              Why Autonomous Agents Choose Lynto
            </h2>
            <p className="mt-2 text-sm text-[#73766D] leading-relaxed">
              Per-request onchain transactions were built for human wallets, not autonomous software calling APIs at 100 requests per second.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Bento 1: Flagship feature card (Neon Yellow Header Accent) */}
            <div className="rounded-3xl border border-[#FCFF52] bg-gradient-to-br from-[#FCFF52]/20 via-[#FCFF52]/5 to-white p-8 md:col-span-2 shadow-soft relative overflow-hidden group">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A] bg-[#FCFF52] px-3 py-1 rounded-full inline-block mb-3 border border-[#0A0A0A]/10">
                Native USDC L1
              </span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-[#191A16] tracking-tight">
                Circle Arc Native Gas &amp; Currency
              </h3>
              <p className="mt-3 text-sm text-[#55584F] leading-relaxed max-w-xl">
                Lynto operates on Arc, Circle&apos;s USDC-native EVM blockchain where USDC is the native gas token. Agent developers never need to balance ETH, SOL, or custom utility tokens. 1 USDC in equals 1 USDC of purchasing power.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-semibold text-[#191A16]">
                <span className="flex items-center gap-1.5 rounded-full bg-white border border-[#EAE7DE] px-3.5 py-1 shadow-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  No token swaps
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-white border border-[#EAE7DE] px-3.5 py-1 shadow-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  No bridge slippage
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-white border border-[#EAE7DE] px-3.5 py-1 shadow-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Predictable budgeting
                </span>
              </div>
            </div>

            {/* Bento 2: Idempotency */}
            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-soft hover:border-[#DED9CD] transition-all">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#73766D] block mb-3">
                Reliability
              </span>
              <h3 className="text-xl font-bold text-[#191A16]">
                Cryptographic Idempotency
              </h3>
              <p className="mt-2 text-sm text-[#666960] leading-relaxed">
                Network drops and server retries are inevitable. Every request enforces a client-provided <code className="rounded-lg bg-[#F5F4EE] px-1.5 py-0.5 text-xs font-mono font-bold text-[#191A16] border border-[#EAE7DE]">x-request-id</code> to guarantee zero duplicate billing.
              </p>
            </div>

            {/* Bento 3: Integer Math */}
            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-soft hover:border-[#DED9CD] transition-all">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#73766D] block mb-3">
                Precision
              </span>
              <h3 className="text-xl font-bold text-[#191A16]">
                Integer-Only Accounting
              </h3>
              <p className="mt-2 text-sm text-[#666960] leading-relaxed">
                Balances are strictly accounted in integer base units (6 decimals). Avoids IEEE 754 floating-point drift across millions of autonomous microcent transactions.
              </p>
            </div>

            {/* Bento 4: Auto Triggers */}
            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-soft hover:border-[#DED9CD] transition-all">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#73766D] block mb-3">
                Automation
              </span>
              <h3 className="text-xl font-bold text-[#191A16]">
                Configurable Batch Triggers
              </h3>
              <p className="mt-2 text-sm text-[#666960] leading-relaxed">
                Set automatic settlement conditions based on dollar threshold ($50.00 USDC) or time elapsed (every 12 hours) to maximize gas efficiency and onchain throughput.
              </p>
            </div>

            {/* Bento 5: Fleet Quotas */}
            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-soft hover:border-[#DED9CD] transition-all">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#73766D] block mb-3">
                Governance
              </span>
              <h3 className="text-xl font-bold text-[#191A16]">
                Multi-Agent Fleet Quotas
              </h3>
              <p className="mt-2 text-sm text-[#666960] leading-relaxed">
                Register separate identities for research crawlers, trading bots, and LLM analyzers. Allocate dedicated budgets and monitor live per-agent usage graphs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Interactive Developer Terminal & API Playground ── */}
      <section id="code" className="border-t border-[#EAE7DE] bg-[#16221C] py-24 text-white scroll-mt-14">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-[#FCFF52] border border-white/10">
                Developer Experience
              </span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Simple, Drop-in Agent SDK
              </h2>
            </div>
            <p className="max-w-md text-sm text-white/70 leading-relaxed">
              Integrate Lynto into LangChain, AutoGPT, CrewAI, Python, or TypeScript runtimes with just a few lines of code.
            </p>
          </div>

          {/* Terminal Box */}
          <div className="rounded-3xl border border-white/15 bg-[#121B16] overflow-hidden shadow-2xl">
            {/* Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-6 py-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#E06C75]/70" />
                <span className="h-3 w-3 rounded-full bg-[#E5C07B]/70" />
                <span className="h-3 w-3 rounded-full bg-[#98C379]/70" />
                <span className="ml-3 font-mono text-xs text-white/50">
                  {activeCodeTab === "ts" && "agent.ts"}
                  {activeCodeTab === "curl" && "request.sh"}
                  {activeCodeTab === "py" && "agent.py"}
                  {activeCodeTab === "sol" && "ILyntoPayments.sol"}
                </span>
              </div>

              {/* Language Switcher Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/5 border border-white/10 text-xs font-mono">
                {(["ts", "curl", "py", "sol"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveCodeTab(tab)}
                    className={`px-3.5 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
                      activeCodeTab === tab
                        ? "bg-[#FCFF52] text-[#0A0A0A] shadow-xs font-bold"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    {tab === "ts" && "TypeScript"}
                    {tab === "curl" && "cURL"}
                    {tab === "py" && "Python"}
                    {tab === "sol" && "Solidity"}
                  </button>
                ))}
              </div>
            </div>

            {/* Pre Code Box */}
            <div className="relative p-6 sm:p-8 bg-[#0E1511] overflow-x-auto">
              <button
                onClick={() => handleCopy(codeSnippets[activeCodeTab], activeCodeTab)}
                className="absolute top-5 right-5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-mono text-white/80 hover:border-[#FCFF52] hover:text-[#FCFF52] transition-colors"
              >
                {copiedTab === activeCodeTab ? "✓ Copied!" : "Copy Snippet"}
              </button>
              <pre className="font-mono text-xs sm:text-sm text-gray-200 leading-relaxed pr-24">
                <code>{codeSnippets[activeCodeTab]}</code>
              </pre>
            </div>

            {/* Live Ping Tester */}
            <div className="border-t border-white/10 bg-white/[0.02] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>Test Live Sample Endpoint:</span>
                  <code className="rounded-xl bg-white/10 px-2.5 py-0.5 font-mono text-xs text-[#FCFF52] border border-white/10">
                    GET /api/paid-data
                  </code>
                </div>
                <p className="mt-1 text-xs text-white/60">
                  Ping the built-in market data route to verify sample response and headers.
                </p>
              </div>

              <button
                onClick={handleTestApi}
                disabled={liveTesting}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#FCFF52] px-5 py-2.5 text-xs font-bold text-[#0A0A0A] hover:bg-[#E8EB3A] transition-all shadow-xs cursor-pointer self-start sm:self-auto active:scale-[0.98]"
              >
                {liveTesting ? (
                  <span className="animate-spin text-[#0A0A0A]">⚡</span>
                ) : (
                  <span className="text-[#0A0A0A] font-bold">▶</span>
                )}
                <span>Query Endpoint</span>
              </button>
            </div>

            {/* Live Response Payload Box */}
            {liveResult && (
              <div className="border-t border-white/10 p-6 bg-[#0B100D]">
                <div className="text-xs font-mono font-semibold text-[#FCFF52] uppercase tracking-wider mb-2 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>Live 200 OK Response:</span>
                </div>
                <pre className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 font-mono text-xs text-emerald-400 overflow-x-auto">
                  {JSON.stringify(liveResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Security & FAQ Accordion ── */}
      <section id="faq" className="mx-auto max-w-5xl xl:max-w-6xl px-6 sm:px-10 lg:px-12 py-24 scroll-mt-14">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F4EE] px-3.5 py-1 text-xs font-semibold text-[#55584F] border border-[#EAE7DE]">
            Protocol Guarantees
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#191A16]">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="divide-y divide-[#EAE7DE] rounded-3xl border border-[#EAE7DE] bg-white shadow-soft overflow-hidden">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="p-7 transition-colors hover:bg-[#FAF9F5]">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between text-left font-semibold text-[#191A16] cursor-pointer"
                >
                  <span className="text-base sm:text-lg">{faq.q}</span>
                  <span className="ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F5F4EE] text-xs font-bold text-[#55584F] border border-[#EAE7DE]">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <p className="mt-4 text-sm leading-relaxed text-[#666960]">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Bottom Impact Banner ── */}
      <section className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12 pb-24">
        <div className="rounded-3xl bg-[#16221C] text-white p-10 sm:p-16 lg:p-20 relative overflow-hidden shadow-comfort border border-[#27382F]">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-[#FCFF52] border border-white/10 mb-5">
              Start in 2 minutes · Arc Layer 1
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Ready to power autonomous software with instant micropayments?
            </h2>
            <p className="mt-5 text-base sm:text-lg text-white/70 leading-relaxed">
              Connect your wallet on Arc, deposit prepaid USDC into non-custodial smart escrow, and register your first autonomous agent identity.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#FCFF52] px-7 py-4 text-sm font-bold text-[#0A0A0A] hover:bg-[#E8EB3A] shadow-sm transition-transform active:scale-[0.98]"
              >
                <span>Open Protocol Dashboard</span>
                <span>→</span>
              </Link>
              <Link
                href="/agents"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-7 py-4 text-sm font-semibold text-white hover:bg-white/15 transition-colors"
              >
                <span>Register Agent</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 bg-black text-white py-0 overflow-hidden">

        {/* Wordmark Showcase on Black Background — top ¾ of image, no padding */}
        <div className="relative w-full flex justify-center py-0 overflow-hidden bg-black">
          <div className="w-full max-w-4xl sm:max-w-5xl lg:max-w-6xl px-6 sm:px-10 lg:px-12 py-0">
            <div className="relative w-full aspect-[496/178] overflow-hidden bg-black">
              <img
                src="/images/lynto_wordmark_neon_yellow.png"
                alt="Lynto Wordmark"
                className="absolute inset-0 h-full w-full object-cover object-top select-none pointer-events-none"
              />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
