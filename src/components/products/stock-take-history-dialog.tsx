"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";
import type { StockTakeItem } from "@/lib/types/database";

/** History of past stock-take runs — grouped into sessions, each one
 * collapsed by default so different rounds don't blur together in one long
 * scroll; click a round's header to view its items, or delete the whole
 * round. Every counted product is kept (not just the ones that differed),
 * labeled เกิน/ขาด/ตรง. Pure record: record_stock_take() never adjusts
 * products.stock itself. */
export function StockTakeHistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);

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

  function toggle(sessionId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  async function handleDelete(sessionId: string, createdAtLabel: string) {
    if (!confirm(`ยืนยันลบรอบนับสต็อกวันที่ ${createdAtLabel}? (ลบแล้วกู้คืนไม่ได้)`)) return;
    setDeleting(sessionId);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("delete_stock_take_session", { p_session_id: sessionId });
    setDeleting(null);
    if (error || !data?.ok) {
      toast.error((error?.message ?? data?.message) || "ลบไม่สำเร็จ");
      return;
    }
    toast.success(data.message ?? "ลบรอบนับสต็อกสำเร็จ!");
    queryClient.invalidateQueries({ queryKey: ["stock-take-history"] });
  }

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

        <div className="max-h-96 space-y-2 overflow-y-auto">
          {sessions.map((session) => {
            const dateLabel = new Date(session.createdAt).toLocaleString("th-TH", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            const isOpen = expanded.has(session.sessionId);
            return (
              <div key={session.sessionId} className="rounded-xl border border-slate-100">
                <div className="flex items-center gap-1 p-2">
                  <button
                    type="button"
                    onClick={() => toggle(session.sessionId)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <span className="truncate text-xs font-semibold text-slate-600">
                      {dateLabel} — {session.items.length} รายการ
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={deleting === session.sessionId}
                    onClick={() => handleDelete(session.sessionId, dateLabel)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                </div>

                {isOpen && (
                  <div className="space-y-1.5 border-t border-slate-100 p-2">
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
                          className="flex items-center justify-between gap-2 rounded-xl bg-slate-50/60 p-2 text-sm"
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
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
