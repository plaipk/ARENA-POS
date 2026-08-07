"use client";

import { cn } from "@/lib/utils";
import type { TransactionMode } from "@/lib/types/database";

const MODES: {
  value: Extract<TransactionMode, "income" | "expense" | "stock_in">;
  label: string;
  active: string;
  shadow: string;
}[] = [
  {
    value: "income",
    label: "ขาย",
    active: "bg-gradient-to-b from-emerald-400 to-emerald-600 text-white border-emerald-700/40",
    shadow: "0 1px 0 rgba(255,255,255,0.4) inset, 0 -2px 3px rgba(0,0,0,0.15) inset, 0 2px 5px -1px rgba(6,95,70,0.5)",
  },
  {
    value: "expense",
    label: "จ่ายทั่วไป",
    active: "bg-gradient-to-b from-rose-400 to-rose-600 text-white border-rose-700/40",
    shadow: "0 1px 0 rgba(255,255,255,0.4) inset, 0 -2px 3px rgba(0,0,0,0.15) inset, 0 2px 5px -1px rgba(159,18,57,0.5)",
  },
  {
    value: "stock_in",
    label: "รับของเข้า",
    active: "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 border-amber-600/40",
    shadow: "0 1px 0 rgba(255,255,255,0.5) inset, 0 -2px 3px rgba(0,0,0,0.12) inset, 0 2px 5px -1px rgba(146,64,14,0.4)",
  },
];

export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: string;
  onChange: (mode: "income" | "expense" | "stock_in") => void;
}) {
  return (
    <div className="sk-well mb-3 flex gap-1 rounded-2xl p-1.5">
      {MODES.map((m) => {
        const active = mode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            style={active ? { boxShadow: m.shadow } : undefined}
            className={cn(
              "flex-1 rounded-xl border border-transparent py-2 text-xs font-semibold text-[var(--ink-soft)] transition-all duration-150",
              active ? m.active : "hover:bg-black/5 active:bg-black/10",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
