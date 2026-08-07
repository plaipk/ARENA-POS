"use client";

import { RefreshCw, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useBalanceSummary } from "@/lib/hooks/use-pos-data";
import { useProfile } from "@/lib/hooks/use-profile";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/utils";

export function BalanceHeader() {
  const { data, isFetching, refetch } = useBalanceSummary();
  const { profile } = useProfile();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="rounded-3xl bg-gradient-to-br from-[#1a1c2c] to-[#4a4e69] p-4 text-white">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="m-0 text-sm font-bold">⚽ ARENA POS PRO</h1>
        <div className="flex items-center gap-1">
          {profile && (
            <span className="mr-1 hidden text-[0.65rem] opacity-75 sm:inline">
              {profile.full_name ?? ""} · {profile.role === "admin" ? "แอดมิน" : "พนักงาน"}
            </span>
          )}
          <button
            onClick={() => refetch()}
            className="rounded-full bg-white/15 px-2 py-1 text-[0.65rem] font-semibold hover:bg-white/25"
          >
            <RefreshCw className={`inline h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> รีเฟรช
          </button>
          <button
            onClick={handleLogout}
            className="rounded-full bg-white/15 p-1.5 hover:bg-white/25"
            title="ออกจากระบบ"
          >
            <LogOut className="h-3 w-3" />
          </button>
        </div>
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
