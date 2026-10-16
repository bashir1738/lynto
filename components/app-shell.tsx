"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnect } from "@/components/wallet-connect";
import { SidebarNav } from "@/components/sidebar-nav";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex min-h-screen bg-[#FAF9F5] text-[#191A16] font-sans">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-[#EAE7DE] bg-[#16221C] text-[#FAF9F5] lg:flex">
        <Link
          href="/"
          className="flex items-center justify-center gap-3 border-b border-white/10 px-6 py-8 transition-colors hover:bg-white/5 group"
        >
          <img
            src="/images/lynto_wordmark_neon_yellow.png"
            alt="Lynto"
            className="h-8 w-auto object-contain group-hover:scale-105 transition-transform"
          />
        </Link>

        <div className="py-4">
          <SidebarNav />
        </div>

        <div className="mt-auto p-4">
          <div className="flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 p-3 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <div className="truncate">
              <span className="text-white/50">Network:</span>{" "}
              <span className="font-semibold text-white">Arc L1</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#EAE7DE] bg-[#16221C] text-[#FAF9F5] transition-transform duration-200 ease-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="relative flex items-center justify-center border-b border-white/10 px-6 py-8">
          <Link href="/" className="flex items-center">
            <img
              src="/images/lynto_wordmark_neon_yellow.png"
              alt="Lynto"
              className="h-8 w-auto object-contain"
            />
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute right-4 rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="py-4">
          <SidebarNav />
        </div>

        <div className="mt-auto p-4">
          <div className="flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 p-3 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <div className="truncate">
              <span className="text-white/50">Network:</span>{" "}
              <span className="font-semibold text-white">Arc L1</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#EAE7DE] bg-white/80 px-4 py-7 backdrop-blur-md shadow-xs sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="rounded-lg p-2 text-[#191A16] transition-colors hover:bg-[#F5F4EE] lg:hidden"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <img
                src="/images/lynto-L-black.svg"
                alt="Lynto"
                className="h-7 w-auto object-contain"
              />
            </Link>
            <span className="hidden items-center gap-2 rounded-full border border-[#EAE7DE] bg-[#F5F4EE] px-3.5 py-1 text-xs font-mono font-medium text-[#191A16] sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="truncate">Arc L1 · 5042</span>
            </span>
          </div>

          <div className="shrink-0">
            <WalletConnect />
          </div>
        </header>

        <main className="mx-auto w-full max-w-8xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-12">
          {children}
        </main>

        <footer className="border-t border-[#EAE7DE] bg-white px-4 py-5 flex items-center justify-center gap-2 text-xs text-[#73766D] sm:px-8">
          <img
            src="/images/lynto-L-black.svg"
            alt="Lynto"
            className="h-4 w-auto object-contain opacity-80"
          />
          <span>Lynto Protocol · Payments for autonomous software</span>
        </footer>
      </div>
    </div>
  );
}
