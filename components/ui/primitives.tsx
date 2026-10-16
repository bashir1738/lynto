import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-[#EAE7DE] bg-white p-6 shadow-[0_4px_20px_-2px_rgba(28,25,23,0.04)] transition-all duration-200 hover:shadow-[0_8px_30px_-4px_rgba(28,25,23,0.07)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-6 transition-all duration-200 relative overflow-hidden",
        highlight
          ? "border-[#FCFF52] bg-[#FCFF52]/15 text-[#0A0A0A] shadow-[0_4px_20px_-2px_rgba(252,255,82,0.3)] ring-1 ring-[#FCFF52]"
          : "border-[#EAE7DE] bg-white text-[#191A16] shadow-[0_4px_20px_-2px_rgba(28,25,23,0.04)] hover:shadow-[0_8px_30px_-4px_rgba(28,25,23,0.07)]"
      )}
    >
      <div
        className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          highlight ? "text-[#0A0A0A]/80 font-bold" : "text-[#73766D]"
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-3xl font-extrabold tracking-tight tabular-nums",
          highlight ? "text-[#0A0A0A]" : "text-[#191A16]"
        )}
      >
        {value}
      </div>
      {sub ? (
        <div
          className={cn(
            "mt-1.5 text-xs font-medium",
            highlight ? "text-[#0A0A0A]/70 font-semibold" : "text-[#73766D]"
          )}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export function Badge({ status }: { status: string }) {
  const isPending = ["pending", "submitted", "settling"].includes(status);
  const isSuccess = ["confirmed", "settled", "active"].includes(status);
  const isFailed = ["failed"].includes(status);

  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FCFF52] px-3 py-0.5 text-xs font-mono font-bold text-[#0A0A0A] border border-[#0A0A0A]/20 shadow-xs">
        <span className="h-1.5 w-1.5 rounded-full bg-black animate-pulse" />
        {status}
      </span>
    );
  }

  if (isSuccess) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F5EC] px-3 py-0.5 text-xs font-mono font-semibold text-[#1C5535] border border-[#C5E6CE]">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {status}
      </span>
    );
  }

  if (isFailed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDF0ED] px-3 py-0.5 text-xs font-mono font-semibold text-[#932F1A] border border-[#F7CEC6]">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        {status}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F2F1EC] px-3 py-0.5 text-xs font-mono font-medium text-[#55584F] border border-[#E3E1D8]">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      {status}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-[#EAE7DE]/70",
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#EAE7DE] bg-[#FAF9F5] py-12 text-center">
      <p className="text-sm font-semibold text-[#55584F]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[#9A9C93]">{description}</p>
      ) : null}
    </div>
  );
}

/** Skeleton shimmer that mimics a loaded card grid (replaces spinners). */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="space-y-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {/* Live flow */}
      <div className="rounded-3xl border border-[#EAE7DE] bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[#EAE7DE] bg-[#FAF9F5] p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-6 w-20" />
              <Skeleton className="mt-2 h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-[#EAE7DE] bg-white p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-28" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
      {/* Content cards */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-[#EAE7DE] bg-white p-6 xl:col-span-2">
          <Skeleton className="h-4 w-36" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-[#EAE7DE] bg-[#FAF9F5] p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-[#EAE7DE] bg-white p-5">
          <Skeleton className="h-4 w-32" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact skeleton for a single card/panel while its data loads. */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-3xl border border-[#EAE7DE] bg-white p-5" role="status" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="btn-secondary mt-3 text-xs">
          Retry
        </button>
      ) : null}
    </div>
  );
}
