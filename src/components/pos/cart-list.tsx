"use client";

import { X } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { CartLine } from "@/lib/types/database";

export function CartList({
  cart,
  onRemove,
}: {
  cart: CartLine[];
  onRemove: (index: number) => void;
}) {
  if (!cart.length) {
    return <p className="py-4 text-center text-sm text-slate-400">ไม่มีรายการ</p>;
  }

  return (
    <div className="my-2 max-h-40 space-y-1.5 overflow-y-auto">
      {cart.map((item, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-2xl border border-slate-100 border-l-4 border-l-indigo-500 bg-slate-50/60 py-2 pl-3 pr-2"
        >
          <div className="text-sm">
            <b>{item.name}</b>
            {item.is_other && <Badge className="ml-1">อื่นๆ</Badge>}
            <br />
            <span className="text-xs text-slate-400">
              {formatMoney(item.price)} x {item.qty}
            </span>
          </div>
          <div className="flex items-center gap-2 text-right">
            <span className="font-bold text-indigo-600">{formatMoney(item.total)}</span>
            <button
              onClick={() => onRemove(i)}
              className="rounded-full p-1 text-rose-500 hover:bg-rose-50"
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
