"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Ban } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { TransactionEditDialog } from "@/components/statement/transaction-edit-dialog";
import { formatMoney } from "@/lib/utils";
import type { Transaction } from "@/lib/types/database";

const CATEGORY_LABELS: Record<Transaction["category"], string> = {
  product_sale: "ขายสินค้า",
  field_rental: "ค่าเช่าสนาม",
  general_expense: "จ่ายทั่วไป",
  stock_purchase: "รับของเข้า",
  debt_settlement: "รับชำระหนี้",
  transfer: "โยกเงิน",
  profit_allocation: "จัดสรรกำไร",
  other_income: "รายได้อื่นๆ",
};

function defaultDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StatementPage() {
  const invalidate = useInvalidatePosData();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(defaultDate(30));
  const [to, setTo] = useState(defaultDate(0));
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["statement", from, to],
    queryFn: async () => {
      const supabase = createClient();

      // Opening balance: net of every non-void transaction strictly before "from",
      // so "คงเหลือ" reads as one running total across the whole ledger (matches
      // the old sheet's single combined cash+transfer running balance column),
      // not just a total reset to 0 at the start of whatever range is selected.
      const { data: priorRows, error: priorError } = await supabase
        .from("transactions")
        .select("income, expense")
        .eq("is_void", false)
        .lt("occurred_at", `${from}T00:00:00`);
      if (priorError) throw priorError;
      const opening = (priorRows ?? []).reduce((s, r) => s + r.income - r.expense, 0);

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`)
        .order("occurred_at", { ascending: true })
        .limit(500);
      if (error) throw error;

      let running = opening;
      const withBalance = (data as Transaction[]).map((t) => {
        if (!t.is_void) running += t.income - t.expense;
        return { ...t, balance: running };
      });
      return withBalance.reverse(); // newest first for display
    },
  });

  const [sheetTxn, setSheetTxn] = useState<(typeof rows)[number] | null>(null);

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["statement"] });
    invalidate();
  }

  async function handleVoid(t: Transaction) {
    if (!confirm(`ยืนยันจะยกเลิกรายการ: "${t.detail}" ใช่หรือไม่?`)) return;
    const reason = prompt("ระบุเหตุผลการยกเลิก (ไม่บังคับ):") ?? "";
    setSheetTxn(null);
    setVoiding(t.id);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("void_transaction", {
      p_transaction_id: t.id,
      p_reason: reason || null,
    });
    setVoiding(null);
    if (error || !data?.ok) {
      toast.error((error?.message ?? data?.message) || "ยกเลิกไม่สำเร็จ");
      return;
    }
    toast.success(data.message ?? "ยกเลิกรายการสำเร็จ!");
    refreshAll();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 p-3 pb-8">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">📑 สเตทเมนต์ (รายการทั้งหมด)</h1>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>จากวันที่</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>ถึงวันที่</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={() => refetch()}>ค้นหา</Button>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading && <p className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !rows.length && (
          <p className="px-4 py-10 text-center text-sm text-slate-400">ไม่พบรายการในช่วงวันที่เลือก</p>
        )}

        {/* Desktop: full table (วันที่/รายละเอียด/หมวดหมู่/รายรับ/รายจ่าย/คงเหลือ/ต้นทุน/กำไร/ชำระ) */}
        {!isLoading && rows.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-400">
                  <th className="py-2 pl-4 pr-2">วันที่</th>
                  <th className="px-2 py-2">รายละเอียด</th>
                  <th className="px-2 py-2">หมวดหมู่</th>
                  <th className="px-2 py-2 text-right">รายรับ</th>
                  <th className="px-2 py-2 text-right">รายจ่าย</th>
                  <th className="px-2 py-2 text-right">คงเหลือ</th>
                  <th className="px-2 py-2 text-right">ต้นทุน</th>
                  <th className="px-2 py-2 text-right">กำไร</th>
                  <th className="px-2 py-2">ชำระ</th>
                  <th className="py-2 pl-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={`border-b border-slate-50 last:border-0 ${t.is_void ? "opacity-40" : ""}`}>
                    <td className="whitespace-nowrap py-2 pl-4 pr-2 text-xs text-slate-500">
                      {formatDateTime(t.occurred_at)}
                    </td>
                    <td className="max-w-[220px] truncate px-2 py-2 font-medium text-slate-800" title={t.detail}>
                      {t.detail}
                      {t.is_void && <Badge variant="danger" className="ml-1">ยกเลิกแล้ว</Badge>}
                    </td>
                    <td className="px-2 py-2">
                      <Badge>{CATEGORY_LABELS[t.category]}</Badge>
                    </td>
                    <td className="px-2 py-2 text-right text-emerald-600">
                      {t.income > 0 ? formatMoney(t.income) : ""}
                    </td>
                    <td className="px-2 py-2 text-right text-rose-600">
                      {t.expense > 0 ? formatMoney(t.expense) : ""}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-slate-700">{formatMoney(t.balance)}</td>
                    <td className="px-2 py-2 text-right text-slate-500">
                      {t.cost_total > 0 ? formatMoney(t.cost_total) : ""}
                    </td>
                    <td className="px-2 py-2 text-right text-indigo-600">
                      {t.profit_total !== 0 ? formatMoney(t.profit_total) : ""}
                    </td>
                    <td className="px-2 py-2 text-xs">{t.payment_method === "cash" ? "เงินสด" : "โอน"}</td>
                    <td className="py-2 pl-2 pr-4">
                      {!t.is_void && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditing(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={voiding === t.id}
                            onClick={() => handleVoid(t)}
                          >
                            <Ban className="h-3.5 w-3.5 text-rose-500" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile: seamless card list — 2 lines + amount, tap a row for the rest */}
        {!isLoading && rows.length > 0 && (
          <div className="m-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 md:hidden">
            {rows.map((t) => (
              <div
                key={t.id}
                className={`cursor-pointer bg-white p-3 active:bg-slate-50 ${t.is_void ? "opacity-40" : ""}`}
                onClick={() => setSheetTxn(t)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800">{t.detail}</span>
                  <span className={`shrink-0 font-bold ${t.income > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {t.income > 0 ? `+${formatMoney(t.income)}` : `-${formatMoney(t.expense)}`}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    <Badge>{CATEGORY_LABELS[t.category]}</Badge>
                    {t.is_void && <Badge variant="danger">ยกเลิกแล้ว</Badge>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{formatDateTime(t.occurred_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <BottomSheet open={!!sheetTxn} onOpenChange={(o) => !o && setSheetTxn(null)}>
        <BottomSheetContent>
          {sheetTxn && (
            <>
              <BottomSheetHeader>
                <BottomSheetTitle>{sheetTxn.detail}</BottomSheetTitle>
              </BottomSheetHeader>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">วันที่</div>
                  {formatDateTime(sheetTxn.occurred_at)}
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">ชำระ</div>
                  {sheetTxn.payment_method === "cash" ? "เงินสด" : "โอน"}
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">รายรับ</div>
                  <span className="text-emerald-600">{sheetTxn.income > 0 ? formatMoney(sheetTxn.income) : "-"}</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">รายจ่าย</div>
                  <span className="text-rose-600">{sheetTxn.expense > 0 ? formatMoney(sheetTxn.expense) : "-"}</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">ต้นทุน</div>
                  {sheetTxn.cost_total > 0 ? formatMoney(sheetTxn.cost_total) : "-"}
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">กำไร</div>
                  <span className="text-indigo-600">
                    {sheetTxn.profit_total !== 0 ? formatMoney(sheetTxn.profit_total) : "-"}
                  </span>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">คงเหลือ</div>
                  {formatMoney(sheetTxn.balance)}
                </div>
              </div>
              {!sheetTxn.is_void && (
                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(sheetTxn);
                      setSheetTxn(null);
                    }}
                  >
                    ✏️ แก้ไข
                  </Button>
                  <Button variant="danger" disabled={voiding === sheetTxn.id} onClick={() => handleVoid(sheetTxn)}>
                    🚫 ยกเลิกรายการ (Void)
                  </Button>
                </div>
              )}
              <Button variant="ghost" onClick={() => setSheetTxn(null)}>
                ปิด
              </Button>
            </>
          )}
        </BottomSheetContent>
      </BottomSheet>

      <TransactionEditDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        transaction={editing}
        onSaved={refreshAll}
      />
    </main>
  );
}
