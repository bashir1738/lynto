"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    href: "/agents",
    label: "Agents",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  {
    href: "/transactions",
    label: "Settlements",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 17l5-5 5 5" />
        <path d="M7 7l5 5 5-5" />
      </svg>
    ),
  },
  {
    href: "/integration",
    label: "Integration",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 18l6-6-6-6" />
        <path d="M8 6l-6 6 6 6" />
      </svg>
    ),
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {nav.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(active ? "sidebar-link-active" : "sidebar-link")}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}

      <div className="mt-6 px-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Network
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
          <span className="h-1.5 w-1.5 rounded-full bg-celo-yellow" />
          Arc · USDC
        </div>
      </div>
    </nav>
  );
}

