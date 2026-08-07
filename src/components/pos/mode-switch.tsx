"use client";

import { cn } from "@/lib/utils";
import type { TransactionMode } from "@/lib/types/database";

const MODES: { value: Extract<TransactionMode, "income" | "expense" | "stock_in">; label: string; active: string }[] = [
  { value: "income", label: "ขาย", active: "bg-emerald-500 text-white" },
  { value: "expense", label: "จ่ายทั่วไป", active: "bg-rose-500 text-white" },
  { value: "stock_in", label: "รับของเข้า", active: "bg-amber-400 text-black" },
];

export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: string;
  onChange: (mode: "income" | "expense" | "stock_in") => void;
}) {
  return (
    <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          className={cn(
            "flex-1 rounded-lg py-2 text-xs font-semibold text-slate-500 transition-colors",
            mode === m.value && m.active,
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
