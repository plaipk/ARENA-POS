"use client";

import { RefreshCw } from "lucide-react";
import { useBalanceSummary } from "@/lib/hooks/use-pos-data";
import { formatMoney } from "@/lib/utils";

export function BalanceHeader() {
  const { data, isFetching, refetch } = useBalanceSummary();

  return (
    <div className="rounded-3xl bg-gradient-to-br from-[#1a1c2c] to-[#4a4e69] p-4 text-white">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="m-0 text-sm font-bold">⚽ ARENA POS PRO</h1>
        <button
          onClick={() => refetch()}
          className="rounded-full bg-white/15 px-2 py-1 text-[0.65rem] font-semibold hover:bg-white/25"
        >
          <RefreshCw className={`inline h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> รีเฟรช
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/15 p-2 text-center backdrop-blur">
          <small className="block text-[0.6rem] opacity-75">เงินสด</small>
          <span className="text-lg font-bold">{data ? formatMoney(data.cash) : "···"}</span>
        </div>
        <div className="rounded-xl bg-white/15 p-2 text-center backdrop-blur">
          <small className="block text-[0.6rem] opacity-75">เงินโอน</small>
          <span className="text-lg font-bold">{data ? formatMoney(data.transfer) : "···"}</span>
        </div>
      </div>
    </div>
  );
}
