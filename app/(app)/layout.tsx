import Link from "next/link";
import { WalletConnect } from "@/components/wallet-connect";
import { SidebarNav } from "@/components/sidebar-nav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#FAF9F5] text-[#191A16] font-sans">
      {/* Left sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#EAE7DE] bg-[#16221C] text-[#FAF9F5] shadow-sm">
        <Link
          href="/"
          className="flex h-18 items-center gap-3 border-b border-white/10 px-6 transition-colors hover:bg-white/5 group"
        >
          <img
            src="/images/lynto-L-neon-yellow.svg"
            alt="Lynto Logo"
            className="h-8 w-auto object-contain group-hover:scale-105 transition-transform"
          />
          <div className="leading-tight">
            <div className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span>Lynto</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-[#FCFF52] font-semibold">
                Arc L1
              </span>
            </div>
            <div className="text-[10px] font-sans text-white/50 tracking-wider">
              Autonomous Payments
            </div>
          </div>
        </Link>

        <div className="py-4">
          <SidebarNav />
        </div>

        <div className="mt-auto p-4 space-y-3">
          <div className="flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 p-3 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <div className="truncate">
              <span className="text-white/50">Network:</span>{" "}
              <span className="font-semibold text-white">Arc L1</span>
            </div>
          </div>

          <div className="border-t border-white/10 pt-3 text-[11px] text-white/50 leading-relaxed px-1">
            Zero gas per API call.
            <br />
            10,000 : 1 Batched settlements.
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col pl-64">
        <header className="sticky top-0 z-30 flex h-18 items-center justify-between border-b border-[#EAE7DE] bg-white/80 px-8 backdrop-blur-md shadow-xs">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 md:hidden">
              <img
                src="/images/lynto-L-black.svg"
                alt="Lynto Logo"
                className="h-7 w-auto object-contain"
              />
              <span className="font-extrabold text-sm text-[#191A16]">Lynto</span>
            </Link>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#EAE7DE] bg-[#F5F4EE] px-3.5 py-1 text-xs font-mono font-medium text-[#191A16]">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Circle Arc EVM Layer 1 (Chain ID 5042)</span>
            </span>
          </div>

          <WalletConnect />
        </header>

        <main className="mx-auto w-full max-w-8xl flex-1 px-8 py-8 lg:px-12">
          {children}
        </main>

        <footer className="border-t border-[#EAE7DE] bg-white px-8 py-5 flex items-center justify-center gap-2 text-xs text-[#73766D]">
          <img
            src="/images/lynto-L-black.svg"
            alt="Lynto"
            className="h-4 w-auto object-contain opacity-80"
          />
          <span>Lynto Protocol · Payments for autonomous software · Arc Layer 1</span>
        </footer>
      </div>
    </div>
  );
}


