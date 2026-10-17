"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function HomePage() {
  const [activeCodeTab, setActiveCodeTab] = useState<"ts" | "curl">("ts");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [dailyVolume, setDailyVolume] = useState<number>(25000);

  const handleCopy = (text: string, tab: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tab);
    setTimeout(() => setCopiedTab(null), 2000);
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
    // 1. Owner deposits prepaid USDC escrow (credited to their agent wallet)
    function deposit(uint256 amount) external;

    // 2. Operator consolidates 10,000 offchain queries in 1 Arc transaction
    function settle(
        address agent,
        uint256 amount,
        bytes32 batchId
    ) external;

    // 3. Owner withdraws permissionlessly via a delayed two-step flow:
    //    request, wait the security delay (10 min default), execute
    function requestWithdraw(uint256 amount) external;
    function executeWithdraw() external;
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
      a: "Yes. Any unreserved deposited USDC can be withdrawn without permission from the service provider. For safety the contract enforces a two-step flow: the owner calls requestWithdraw(amount), waits the withdrawal delay (10 minutes by default, owner-configurable up to 1 day), then calls executeWithdraw(). Usage reserved during the delay can never be withdrawn — only funds that are available at execution time are paid out.",
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
      desc: "Agent owner deposits USDC into the LyntoPayments contract on Arc Layer 1. Balance is verifiable onchain, with non-custodial withdrawal rights preserved 24/7 via a short two-step delay.",
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
    <div className="w-full min-h-screen bg-[#FAF9F5] text-[#191A16] font-sans [overflow-x:clip] selection:bg-[#FCFF52] selection:text-[#0A0A0A]">
      {/* ── Hero Section (Neon Yellow Background + 3D Rolling "Lynto" Cube) ── */}
      <section className="relative w-full bg-celo-yellow text-[#191A16] border-b border-[#EAE7DE] py-20 sm:py-28 lg:py-36 flex flex-col items-center justify-center overflow-hidden">

        <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto">
          {/* 3D Rolling Cube Scene */}
          <div className="cube-scene py-4 select-none cursor-grab active:cursor-grabbing">
            <div className="cube-wrapper">
              {/* Front Face */}
              <div className="cube-face cube-face-front border-4 border-black flex items-center justify-center">
                <img
                  src="/images/Neon Lynto Geometric Logo.png"
                  alt="Lynto Logo"
                  className="w-[72%] h-[72%] object-contain select-none pointer-events-none drop-shadow-[0_0_18px_rgba(252,255,82,0.45)]"
                />
              </div>

              {/* Back Face */}
              <div className="cube-face cube-face-back border-4 border-black flex items-center justify-center">
                <img
                  src="/images/Neon Lynto Geometric Logo.png"
                  alt="Lynto Logo"
                  className="w-[72%] h-[72%] object-contain select-none pointer-events-none drop-shadow-[0_0_18px_rgba(252,255,82,0.45)]"
                />
              </div>

              {/* Right Face */}
              <div className="cube-face cube-face-right border-4 border-black flex items-center justify-center">
                <img
                  src="/images/Neon Lynto Geometric Logo.png"
                  alt="Lynto Logo"
                  className="w-[72%] h-[72%] object-contain select-none pointer-events-none drop-shadow-[0_0_18px_rgba(252,255,82,0.45)]"
                />
              </div>

              {/* Left Face */}
              <div className="cube-face cube-face-left border-4 border-black flex items-center justify-center">
                <img
                  src="/images/Neon Lynto Geometric Logo.png"
                  alt="Lynto Logo"
                  className="w-[72%] h-[72%] object-contain select-none pointer-events-none drop-shadow-[0_0_18px_rgba(252,255,82,0.45)]"
                />
              </div>

              {/* Top Face */}
              <div className="cube-face cube-face-top border-4 border-black flex items-center justify-center">
                <img
                  src="/images/Neon Lynto Geometric Logo.png"
                  alt="Lynto Logo"
                  className="w-[72%] h-[72%] object-contain select-none pointer-events-none drop-shadow-[0_0_18px_rgba(252,255,82,0.45)]"
                />
              </div>

              {/* Bottom Face */}
              <div className="cube-face cube-face-bottom border-4 border-black flex items-center justify-center">
                <img
                  src="/images/Neon Lynto Geometric Logo.png"
                  alt="Lynto Logo"
                  className="w-[72%] h-[72%] object-contain select-none pointer-events-none drop-shadow-[0_0_18px_rgba(252,255,82,0.45)]"
                />
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

      {/* ── Sticky Header / Navbar ── */}
      <nav className="sticky top-0 z-50 border-b-4 border-black bg-[#FAF9F5]/95 backdrop-blur-md text-[#191A16] shadow-lg transition-all duration-200">
        <div className="mx-auto flex h-16 sm:h-20 lg:h-24 max-w-7xl xl:max-w-[1400px] items-center justify-between px-4 sm:px-6 md:px-8 lg:px-12">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/images/lynto-L-black.svg"
              alt="Lynto Logo"
              className="h-8 sm:h-10 lg:h-12 w-auto object-contain group-hover:scale-105 transition-transform"
            />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-7 text-sm font-bold text-[#55584F]">
            <a href="#how-it-works" className="hover:text-[#191A16] transition-colors">
              Architecture
            </a>
            <a href="#calculator" className="hover:text-[#191A16] transition-colors">
              ROI
            </a>
            <a href="#features" className="hover:text-[#191A16] transition-colors">
              Capabilities
            </a>
            <a href="#code" className="hover:text-[#191A16] transition-colors">
              SDK
            </a>
            <a href="#faq" className="hover:text-[#191A16] transition-colors">
              FAQ
            </a>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/agents"
              className="inline-flex items-center rounded-xl border-2 border-black bg-white px-5 py-2.5 text-sm font-bold text-[#191A16] hover:bg-black/5 transition-all"
            >
              Agents
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl bg-black px-6 py-2.5 text-sm font-black text-celo-yellow hover:bg-[#1a1a1a] transition-all active:scale-[0.98]"
            >
              <span>Dashboard</span>
              <span>→</span>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex h-11 w-11 items-center justify-center rounded-xl border-2 border-black bg-white hover:bg-black/5 transition-colors"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            <div className="relative flex h-5 w-5 flex-col justify-center gap-1.5">
              <span
                className={`block h-0.5 w-5 bg-black transition-transform duration-200 ${
                  mobileMenuOpen ? "translate-y-2 rotate-45" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-5 bg-black transition-opacity duration-200 ${
                  mobileMenuOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-5 bg-black transition-transform duration-200 ${
                  mobileMenuOpen ? "-translate-y-2 -rotate-45" : ""
                }`}
              />
            </div>
          </button>
        </div>

        {/* Mobile menu dropdown */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 border-t-2 border-black/10 ${
            mobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="px-4 sm:px-6 py-4 space-y-1 bg-[#FAF9F5]">
            {[
              { href: "#how-it-works", label: "Architecture" },
              { href: "#calculator", label: "ROI" },
              { href: "#features", label: "Capabilities" },
              { href: "#code", label: "SDK" },
              { href: "#faq", label: "FAQ" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block rounded-xl px-4 py-3 text-sm font-bold text-[#55584F] hover:bg-black/5 hover:text-[#191A16] transition-colors"
              >
                {item.label}
              </a>
            ))}
            <div className="pt-3 flex flex-col gap-2 border-t-2 border-black/10 mt-3">
              <Link
                href="/agents"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center rounded-xl border-2 border-black bg-white px-5 py-3 text-sm font-bold text-[#191A16] hover:bg-black/5 transition-all"
              >
                Agents
              </Link>
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-black px-6 py-3 text-sm font-black text-celo-yellow hover:bg-[#1a1a1a] transition-all"
              >
                <span>Dashboard</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Key Protocol Metrics (Calm, serene metric cards) ── */}
      <section className="border-b border-[#EAE7DE] bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                v: "$0.00",
                l: "Gas Per API Call",
                s: "Metered offchain. Zero transaction fees burned per query.",
              },
              {
                v: "< 3ms",
                l: "Metering Latency",
                s: "Instant authorization without block-time pauses.",
              },
              {
                v: "10,000 : 1",
                l: "Settlement Ratio",
                s: "Thousands of micro-calls aggregated into 1 Arc transaction.",
              },
              {
                v: "100%",
                l: "Non-Custodial",
                s: "Prepaid escrow with permissionless owner withdrawals (two-step, ~10 min delay).",
              },
            ].map((m) => (
              <div
                key={m.l}
                className="rounded-2xl border border-[#EAE7DE] bg-[#FAF9F5] p-6 sm:p-7 transition-all hover:border-[#16221C]/25 hover:shadow-xs"
              >
                <div className="text-3xl sm:text-4xl font-extrabold text-[#191A16] tabular-nums tracking-tight">
                  {m.v}
                </div>
                <div className="mt-2 text-xs font-bold uppercase tracking-wider text-[#191A16]">
                  {m.l}
                </div>
                <p className="mt-2 text-xs text-[#73766D] leading-relaxed">
                  {m.s}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Architecture / 3-Step Journey ── */}
      <section id="how-it-works" className="border-b border-[#EAE7DE] bg-[#FAF9F5] py-20 sm:py-24 scroll-mt-24">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE7DE] bg-white px-3.5 py-1 text-xs font-semibold text-[#666960] shadow-xs">
              Simple &amp; Verifiable
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#191A16]">
              How Lynto Powers Autonomous Agents
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#73766D] leading-relaxed">
              Eliminate runtime gas and block-latency without sacrificing smart contract guarantees.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Deposit Smart Escrow",
                badge: "Arc L1",
                desc: "Fund prepaid USDC into the LyntoPayments contract on Arc. Your balance is verifiable onchain with permissionless withdrawals anytime via a short two-step delay.",
                code: "contract.deposit(agent, 50.00 USDC)",
              },
              {
                step: "02",
                title: "Zero-Gas Offchain Metering",
                badge: "< 3ms Latency",
                desc: "Autonomous software calls paid APIs without signing transactions. Microcent usage is metered in-memory with cryptographic idempotency.",
                code: "agent.query({ id: 'market-intel' })",
              },
              {
                step: "03",
                title: "Consolidated Settlement",
                badge: "10,000 : 1 Batch",
                desc: "Accrued usage across thousands of requests settles periodically in a single onchain transaction, slashing network costs by 99.9%.",
                code: "contract.settle(agent, amount, batchId)",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="flex flex-col justify-between rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-xs hover:border-[#16221C]/25 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FCFF52] text-xs font-extrabold text-[#0A0A0A] shadow-xs">
                      {s.step}
                    </span>
                    <span className="rounded-full bg-[#FAF9F5] border border-[#EAE7DE] px-3 py-1 text-[11px] font-mono font-medium text-[#73766D]">
                      {s.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-[#191A16]">{s.title}</h3>
                  <p className="mt-3 text-sm text-[#73766D] leading-relaxed">{s.desc}</p>
                </div>

                <div className="mt-8 pt-4 border-t border-[#EAE7DE]">
                  <code className="text-xs font-mono text-[#666960] truncate block bg-[#FAF9F5] px-3 py-2 rounded-xl border border-[#EAE7DE]">
                    {s.code}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Unit Economics Calculator ── */}
      <section id="calculator" className="border-b border-[#EAE7DE] bg-white py-20 sm:py-24 scroll-mt-24">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE7DE] bg-[#FAF9F5] px-3.5 py-1 text-xs font-semibold text-[#666960] shadow-xs">
              Cost Simulator
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#191A16]">
              Compare Per-Query Gas vs. Batched Settlement
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#73766D] leading-relaxed">
              See how consolidating micro-calls into periodic Arc batches drastically reduces operational overhead.
            </p>
          </div>

          <div className="max-w-4xl mx-auto rounded-3xl border border-[#EAE7DE] bg-[#FAF9F5] p-8 sm:p-12 shadow-sm">
            {/* Slider */}
            <div className="mb-10">
              <div className="flex items-center justify-between text-sm font-semibold text-[#191A16] mb-3">
                <span>Daily API Query Volume</span>
                <span className="font-mono text-sm sm:text-base font-bold bg-[#FCFF52] text-[#0A0A0A] px-3.5 py-1 rounded-xl shadow-xs">
                  {dailyVolume.toLocaleString()} calls / day
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="250000"
                step="1000"
                value={dailyVolume}
                onChange={(e) => setDailyVolume(Number(e.target.value))}
                className="w-full h-2 bg-[#EAE7DE] rounded-lg appearance-none cursor-pointer accent-[#191A16]"
              />
              <div className="flex justify-between text-[11px] font-mono text-[#91948B] mt-2">
                <span>1,000</span>
                <span>50,000</span>
                <span>150,000</span>
                <span>250,000</span>
              </div>
            </div>

            {/* Comparison Grid */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#EAE7DE] bg-white p-6 shadow-xs">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#73766D] block mb-2 font-bold">
                  Traditional Web3
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold text-[#191A16] tabular-nums">
                  {traditionalGasPerMonth}
                </div>
                <p className="mt-2 text-xs text-[#73766D] leading-relaxed">
                  {(dailyVolume * 30).toLocaleString()} separate onchain txs with high gas.
                </p>
              </div>

              <div className="rounded-2xl border border-[#EAE7DE] bg-white p-6 shadow-xs">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#73766D] block mb-2 font-bold">
                  Lynto Batched
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold text-[#191A16] tabular-nums">
                  {lyntoCostPerMonth}
                </div>
                <p className="mt-2 text-xs text-[#73766D] leading-relaxed">
                  30 batched Arc settlements. Zero gas per request.
                </p>
              </div>

              <div className="rounded-2xl border border-[#FCFF52] bg-[#FCFF52]/15 p-6 shadow-xs ring-1 ring-[#FCFF52]">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#0A0A0A] block mb-2 font-extrabold">
                  Net Monthly Savings
                </span>
                <div className="text-2xl sm:text-3xl font-black text-[#0A0A0A] tabular-nums">
                  {gasSavedPerMonth}
                </div>
                <p className="mt-2 text-xs text-[#0A0A0A]/80 leading-relaxed font-medium">
                  99.98% fee reduction + {hoursSavedPerMonth}h latency saved.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Capabilities (Curated to 3 peaceful cards) ── */}
      <section id="features" className="border-b border-[#EAE7DE] bg-[#FAF9F5] py-20 sm:py-24 scroll-mt-24">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE7DE] bg-white px-3.5 py-1 text-xs font-semibold text-[#666960] shadow-xs">
              Capabilities
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#191A16]">
              Engineered for Autonomous Reliability
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#73766D] leading-relaxed">
              Standard blockchains were designed for human wallets. Lynto was built specifically for software agents.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-xs hover:border-[#16221C]/25 transition-all">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FCFF52] px-3 py-1 text-xs font-bold text-[#0A0A0A] mb-4">
                Native USDC
              </span>
              <h3 className="text-lg font-bold text-[#191A16]">
                Circle Arc Native Gas &amp; Currency
              </h3>
              <p className="mt-3 text-sm text-[#73766D] leading-relaxed">
                Lynto operates natively on Arc — Circle&apos;s USDC-native Layer 1. No separate volatile tokens (ETH, SOL, MATIC) to manage. 1 USDC deposited is always 1 USDC of purchasing power.
              </p>
            </div>

            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-xs hover:border-[#16221C]/25 transition-all">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF9F5] border border-[#EAE7DE] px-3 py-1 text-xs font-semibold text-[#666960] mb-4">
                Idempotency
              </span>
              <h3 className="text-lg font-bold text-[#191A16]">
                Cryptographic Duplicate Protection
              </h3>
              <p className="mt-3 text-sm text-[#73766D] leading-relaxed">
                Every request enforces a unique client <code className="rounded bg-[#FAF9F5] px-1.5 py-0.5 text-xs font-mono font-medium border border-[#EAE7DE]">x-request-id</code> header. Network retries and concurrent workers never trigger duplicate charges.
              </p>
            </div>

            <div className="rounded-3xl border border-[#EAE7DE] bg-white p-8 shadow-xs hover:border-[#16221C]/25 transition-all">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF9F5] border border-[#EAE7DE] px-3 py-1 text-xs font-semibold text-[#666960] mb-4">
                Fleet Governance
              </span>
              <h3 className="text-lg font-bold text-[#191A16]">
                Dedicated Budgets &amp; Live Telemetry
              </h3>
              <p className="mt-3 text-sm text-[#73766D] leading-relaxed">
                Assign separate wallet identities, configurable spending quotas, and live consumption tracking to each worker in your autonomous software fleet.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Developer SDK (Clean, calm code preview) ── */}
      <section id="code" className="border-b border-[#EAE7DE] bg-white py-20 sm:py-24 scroll-mt-24">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE7DE] bg-[#FAF9F5] px-3.5 py-1 text-xs font-semibold text-[#666960] shadow-xs">
              Developer SDK
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#191A16]">
              Simple Integration in Minutes
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#73766D] leading-relaxed">
              Drop Lynto into your LangChain, AutoGPT, CrewAI, Python, or TypeScript agents with a few lines of code.
            </p>
          </div>

          <div className="max-w-4xl mx-auto rounded-3xl border border-[#16221C]/15 bg-[#16221C] text-white overflow-hidden shadow-comfort">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-[#141C18]">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FCFF52]" />
                <span className="font-mono text-xs text-white/60">
                  {activeCodeTab === "ts" ? "agent.ts" : "request.sh"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex rounded-xl bg-white/5 p-1 border border-white/10 text-xs font-mono">
                  <button
                    onClick={() => setActiveCodeTab("ts")}
                    className={`rounded-lg px-3 py-1 font-semibold transition-colors ${
                      activeCodeTab === "ts"
                        ? "bg-[#FCFF52] text-[#0A0A0A]"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    TypeScript
                  </button>
                  <button
                    onClick={() => setActiveCodeTab("curl")}
                    className={`rounded-lg px-3 py-1 font-semibold transition-colors ${
                      activeCodeTab === "curl"
                        ? "bg-[#FCFF52] text-[#0A0A0A]"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    cURL
                  </button>
                </div>

                <button
                  onClick={() => handleCopy(codeSnippets[activeCodeTab], activeCodeTab)}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-mono text-white/80 hover:border-[#FCFF52] hover:text-[#FCFF52] transition-colors"
                >
                  {copiedTab === activeCodeTab ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="p-6 sm:p-8 overflow-x-auto">
              <pre className="font-mono text-xs sm:text-sm text-gray-200 leading-relaxed">
                <code>{codeSnippets[activeCodeTab]}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="border-b border-[#EAE7DE] bg-[#FAF9F5] py-20 sm:py-24 scroll-mt-24">
        <div className="mx-auto max-w-4xl px-6 sm:px-10 lg:px-12">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EAE7DE] bg-white px-3.5 py-1 text-xs font-semibold text-[#666960] shadow-xs">
              Guarantees
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#191A16]">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="rounded-3xl border border-[#EAE7DE] bg-white divide-y divide-[#EAE7DE] overflow-hidden shadow-xs">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="p-6 transition-colors hover:bg-[#FAF9F5]/60">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between text-left font-bold text-[#191A16] cursor-pointer"
                  >
                    <span className="text-base sm:text-lg">{faq.q}</span>
                    <span
                      className={`ml-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                        isOpen
                          ? "bg-[#FCFF52] text-[#0A0A0A]"
                          : "bg-[#F5F4EE] text-[#55584F]"
                      }`}
                    >
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
        </div>
      </section>

      {/* ── Bottom Impact Banner ── */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl xl:max-w-[1400px] px-6 sm:px-10 lg:px-12">
          <div className="rounded-3xl bg-[#16221C] text-white p-10 sm:p-14 lg:p-16 border border-[#27382F] shadow-comfort relative overflow-hidden">
            <div className="relative z-10 max-w-3xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-[#FCFF52] border border-white/10 mb-5">
                Arc Layer 1 · Non-Custodial
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Ready to power autonomous software with instant micropayments?
              </h2>
              <p className="mt-4 text-base text-white/70 leading-relaxed max-w-2xl">
                Connect your wallet on Arc, deposit prepaid USDC into non-custodial escrow, and register your first agent in minutes.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#FCFF52] px-7 py-3.5 text-sm font-bold text-[#0A0A0A] hover:bg-[#E8EB3A] shadow-sm transition-all active:scale-[0.98]"
                >
                  <span>Open Protocol Dashboard</span>
                  <span>→</span>
                </Link>
                <Link
                  href="/agents"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white hover:bg-white/15 transition-colors"
                >
                  <span>Register Agent</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-black/10 bg-celo-yellow text-[#0A0A0A] py-0 overflow-hidden">

        {/* Wordmark Showcase on Celo Yellow Background — top 3/5 of image, no padding */}
        <div className="relative w-full flex justify-center py-0 overflow-hidden bg-celo-yellow">
          <div className="w-full max-w-4xl sm:max-w-5xl lg:max-w-6xl px-6 sm:px-10 lg:px-12 py-0">
            <div className="relative w-full aspect-[496/142] overflow-hidden bg-celo-yellow">
              <img
                src="/images/lynto_wordmark_black.png"
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
