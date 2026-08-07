"use client";

import { X } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import type { CartLine } from "@/lib/types/database";

export function CartList({
  cart,
  onRemove,
}: {
  cart: CartLine[];
  onRemove: (index: number) => void;
}) {
  if (!cart.length) {
    return <p className="py-4 text-center text-sm text-[var(--ink-soft)]">ไม่มีรายการ</p>;
  }

  return (
    <div className="my-2 max-h-40 space-y-1.5 overflow-y-auto">
      {cart.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] py-2 pl-3 pr-2 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_2px_4px_-1px_rgba(60,45,10,0.15)]"
          style={{ borderLeft: "4px solid #7209b7" }}
        >
          <div className="text-sm">
            <b className="text-[var(--ink)]">{item.name}</b>
            <br />
            <span className="text-xs text-[var(--ink-soft)]">
              {formatMoney(item.price)} x {item.qty}
            </span>
          </div>
          <div className="flex items-center gap-2 text-right">
            <span className="font-mono font-bold text-indigo-700">{formatMoney(item.total)}</span>
            <button
              onClick={() => onRemove(i)}
              className="rounded-full p-1 text-rose-500 shadow-[var(--shadow-raised-sm)] transition active:translate-y-px active:shadow-[var(--shadow-pressed)]"
              title="ลบ"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
