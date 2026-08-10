"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StockTakeEntry {
  id: string;
  detail: string | null;
  amount: number | null;
  created_at: string;
}

/** History of past stock-take runs — each row is one product's adjustment
 * from record_stock_take() (วันที่ตรวจ, เดิม -> นับได้, ส่วนต่าง), pulled
 * straight from audit_log (already written there, just wasn't visible anywhere). */
export function StockTakeHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["stock-take-history"],
    enabled: open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, detail, amount, created_at")
        .eq("action", "นับสต็อก")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as StockTakeEntry[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>🕓 ประวัติการนับสต็อก</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !entries.length && (
          <p className="py-6 text-center text-sm text-slate-400">ยังไม่เคยนับสต็อก</p>
        )}

        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {entries.map((e) => {
            const diff = e.amount ?? 0;
            return (
              <div key={e.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-800">{e.detail}</span>
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-slate-400"
                    }`}
                  >
                    {diff > 0 ? `+${diff}` : diff}
                  </span>
                </div>
                <div className="mt-0.5 text-[0.65rem] text-slate-400">
                  {new Date(e.created_at).toLocaleString("th-TH", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
