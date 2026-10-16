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

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface-muted py-12 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-slate-500">
      <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-accent" />
      {label}
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
