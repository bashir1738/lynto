"use client";

import { useState } from "react";

export function CodeBlock({
  code,
  language = "typescript",
  filename,
}: {
  code: string;
  language?: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked */
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#EAE7DE] bg-[#0F1713]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] text-white/50">
          {filename ?? language}
        </span>
        <button
          onClick={copy}
          className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-[#FCFF52] hover:bg-white/15"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12px] leading-relaxed text-gray-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}
