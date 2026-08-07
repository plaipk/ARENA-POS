"use client";

import { RefreshCw } from "lucide-react";
import { useBalanceSummary } from "@/lib/hooks/use-pos-data";
import { formatMoney } from "@/lib/utils";

export function BalanceHeader() {
  const { data, isFetching, refetch } = useBalanceSummary();

  return (
    <div
      className="rounded-3xl border border-black/20 p-4 text-white"
      style={{
        background: "linear-gradient(180deg, #34385a, #1a1c2c 55%, #14162280)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.15) inset, 0 -3px 6px rgba(0,0,0,0.4) inset, 0 10px 24px -8px rgba(0,0,0,0.6)",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h1 className="m-0 text-sm font-bold tracking-wide drop-shadow-sm">⚽ ARENA POS PRO</h1>
        <button
          onClick={() => refetch()}
          className="rounded-full border border-white/10 bg-gradient-to-b from-white/20 to-white/5 px-2 py-1 text-[0.65rem] font-semibold shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_2px_4px_rgba(0,0,0,0.3)] transition active:translate-y-px active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
        >
          <RefreshCw className={`inline h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> รีเฟรช
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div
          className="rounded-2xl border border-black/30 p-3 text-center"
          style={{ background: "linear-gradient(180deg, #0f1119, #05060a)", boxShadow: "var(--shadow-well)" }}
        >
          <small className="block text-[0.6rem] uppercase tracking-widest text-white/50">เงินสด</small>
          <span className="font-mono text-xl font-bold text-emerald-300 [text-shadow:0_0_6px_rgba(52,211,153,0.5)]">
            {data ? formatMoney(data.cash) : "···"}
          </span>
        </div>
        <div
          className="rounded-2xl border border-black/30 p-3 text-center"
          style={{ background: "linear-gradient(180deg, #0f1119, #05060a)", boxShadow: "var(--shadow-well)" }}
        >
          <small className="block text-[0.6rem] uppercase tracking-widest text-white/50">เงินโอน</small>
          <span className="font-mono text-xl font-bold text-sky-300 [text-shadow:0_0_6px_rgba(125,211,252,0.5)]">
            {data ? formatMoney(data.transfer) : "···"}
          </span>
        </div>
      </div>
    </div>
  );
}
