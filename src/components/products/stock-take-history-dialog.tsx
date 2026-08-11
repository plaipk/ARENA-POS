"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";
import type { StockTakeItem } from "@/lib/types/database";

/** History of past stock-take runs — grouped into sessions, every counted
 * product shown (not just the ones that differed), labeled เกิน/ขาด/ตรง.
 * Pure record: record_stock_take() never adjusts products.stock itself. */
export function StockTakeHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["stock-take-history"],
    enabled: open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("stock_take_items")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as StockTakeItem[];
    },
  });

  // Group into sessions, preserving the newest-first order the query already gave us.
  const sessions = useMemo(() => {
    const map = new Map<string, StockTakeItem[]>();
    for (const item of items) {
      const list = map.get(item.session_id) ?? [];
      list.push(item);
      map.set(item.session_id, list);
    }
    return [...map.entries()].map(([sessionId, sessionItems]) => ({
      sessionId,
      createdAt: sessionItems[0].created_at,
      items: sessionItems,
    }));
  }, [items]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>🕓 ประวัติการนับสต็อก</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !sessions.length && (
          <p className="py-6 text-center text-sm text-slate-400">ยังไม่เคยนับสต็อก</p>
        )}

        <div className="max-h-96 space-y-4 overflow-y-auto">
          {sessions.map((session) => (
            <div key={session.sessionId}>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">
                {new Date(session.createdAt).toLocaleString("th-TH", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                — {session.items.length} รายการ
              </p>
              <div className="space-y-1.5">
                {session.items.map((item) => {
                  const status =
                    item.diff > 0
                      ? { label: `เกิน ${formatMoney(item.diff)}`, variant: "success" as const }
                      : item.diff < 0
                        ? { label: `ขาด ${formatMoney(Math.abs(item.diff))}`, variant: "danger" as const }
                        : { label: "ตรง", variant: "default" as const };
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-slate-800">{item.product_name}</div>
                        <div className="text-[0.65rem] text-slate-400">
                          ในระบบ {formatMoney(item.system_stock)} · นับได้ {formatMoney(item.counted_stock)}
                        </div>
                      </div>
                      <Badge variant={status.variant} className="shrink-0">
                        {status.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
