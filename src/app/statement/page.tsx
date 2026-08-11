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
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { TransactionEditDialog } from "@/components/statement/transaction-edit-dialog";
import { formatMoney } from "@/lib/utils";
import type { Debt, DebtStatus, Transaction } from "@/lib/types/database";

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

const DEBT_STATUS_BADGE: Record<DebtStatus, { label: string; variant: BadgeProps["variant"] }> = {
  outstanding: { label: "ยังไม่ชำระ", variant: "warning" },
  partial: { label: "จ่ายบางส่วน", variant: "warning" },
  paid: { label: "ชำระแล้ว", variant: "success" },
  void: { label: "ยกเลิกแล้ว", variant: "danger" },
};

/** Unifies transactions (real cash/void movements) and debts (เซ็นค้างชำระ —
 * a separate table, no cash moved yet) into one row shape so the statement
 * reads as a single timeline "ตั้งแต่โยกเงินยันจัดสรร" instead of hiding
 * credit sales entirely. Debt rows never touch `balance` — settling one
 * later creates its own category='debt_settlement' transaction row, which
 * is what actually moves cash. */
interface StatementRow {
  id: string;
  kind: "transaction" | "debt";
  occurred_at: string;
  detail: string;
  categoryLabel: string;
  income: number | null;
  expense: number | null;
  balance: number | null;
  cost_total: number;
  profit_total: number;
  paymentLabel: string;
  dim: boolean;
  statusBadge: { label: string; variant: BadgeProps["variant"] } | null;
  canEdit: boolean;
  canVoid: boolean;
  transaction: Transaction | null;
  debt: Debt | null;
}

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

      // Opening balance: net of every non-void transaction strictly before "from"
      // (debts never contribute — no cash moves until a debt is settled, which
      // shows up as its own transactions row), so "คงเหลือ" reads as one running
      // total across the whole ledger, not reset to 0 at the range's start.
      const { data: priorRows, error: priorError } = await supabase
        .from("transactions")
        .select("income, expense")
        .eq("is_void", false)
        .lt("occurred_at", `${from}T00:00:00`);
      if (priorError) throw priorError;
      const opening = (priorRows ?? []).reduce((s, r) => s + r.income - r.expense, 0);

      const { data: txns, error: txnError } = await supabase
        .from("transactions")
        .select("*")
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`)
        .order("occurred_at", { ascending: true })
        .limit(500);
      if (txnError) throw txnError;

      const { data: debts, error: debtError } = await supabase
        .from("debts")
        .select("*")
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`)
        .order("occurred_at", { ascending: true })
        .limit(500);
      if (debtError) throw debtError;

      let running = opening;
      const txnRows: StatementRow[] = (txns as Transaction[]).map((t) => {
        if (!t.is_void) running += t.income - t.expense;
        return {
          id: t.id,
          kind: "transaction",
          occurred_at: t.occurred_at,
          detail: t.detail,
          categoryLabel: CATEGORY_LABELS[t.category],
          income: t.income,
          expense: t.expense,
          balance: running,
          cost_total: t.cost_total,
          profit_total: t.profit_total,
          paymentLabel: t.payment_method === "cash" ? "เงินสด" : "โอน",
          dim: t.is_void,
          statusBadge: t.is_void ? { label: "ยกเลิกแล้ว", variant: "danger" } : null,
          canEdit: !t.is_void,
          canVoid: !t.is_void,
          transaction: t,
          debt: null,
        };
      });

      const debtRows: StatementRow[] = (debts as Debt[]).map((d) => ({
        id: d.id,
        kind: "debt",
        occurred_at: d.occurred_at,
        detail: `${d.customer_name}: ${d.detail}`,
        categoryLabel: "เซ็นค้างชำระ",
        income: d.amount,
        expense: null,
        balance: null,
        cost_total: d.cost_total,
        profit_total: d.profit_total,
        paymentLabel: "เซ็น",
        dim: d.status === "void",
        statusBadge: DEBT_STATUS_BADGE[d.status],
        canEdit: false,
        canVoid: d.status === "outstanding" || d.status === "partial",
        transaction: null,
        debt: d,
      }));

      return [...txnRows, ...debtRows].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      );
    },
  });

  const [sheetRow, setSheetRow] = useState<StatementRow | null>(null);

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["statement"] });
    invalidate();
  }

  async function handleVoid(row: StatementRow) {
    if (!confirm(`ยืนยันจะยกเลิกรายการ: "${row.detail}" ใช่หรือไม่?`)) return;
    const reason = prompt("ระบุเหตุผลการยกเลิก (ไม่บังคับ):") ?? "";
    setSheetRow(null);
    setVoiding(row.id);
    const supabase = createClient();
    const { data, error } =
      row.kind === "debt"
        ? await supabase.rpc("void_debt", { p_debt_id: row.id, p_reason: reason || null })
        : await supabase.rpc("void_transaction", { p_transaction_id: row.id, p_reason: reason || null });
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

        {/* Desktop: full table — ทุกรายการตั้งแต่โยกเงินยันจัดสรร รวมเซ็นค้างชำระด้วย */}
        {!isLoading && rows.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-400">
                  <th className="py-2 pl-4 pr-2">วันที่</th>
                  <th className="px-2 py-2">รายละเอียด</th>
                  <th className="px-2 py-2">หมวดหมู่</th>
                  <th className="px-2 py-2">สถานะ</th>
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
                {rows.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-50 last:border-0 ${r.dim ? "opacity-40" : ""}`}>
                    <td className="whitespace-nowrap py-2 pl-4 pr-2 text-xs text-slate-500">
                      {formatDateTime(r.occurred_at)}
                    </td>
                    <td className="max-w-[220px] truncate px-2 py-2 font-medium text-slate-800" title={r.detail}>
                      {r.detail}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant={r.kind === "debt" ? "info" : "default"}>{r.categoryLabel}</Badge>
                    </td>
                    <td className="px-2 py-2">
                      {r.statusBadge && <Badge variant={r.statusBadge.variant}>{r.statusBadge.label}</Badge>}
                    </td>
                    <td className="px-2 py-2 text-right text-emerald-600">
                      {r.income ? formatMoney(r.income) : ""}
                    </td>
                    <td className="px-2 py-2 text-right text-rose-600">
                      {r.expense ? formatMoney(r.expense) : ""}
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-slate-700">
                      {r.balance !== null ? formatMoney(r.balance) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-500">
                      {r.cost_total > 0 ? formatMoney(r.cost_total) : ""}
                    </td>
                    <td className="px-2 py-2 text-right text-indigo-600">
                      {r.profit_total !== 0 ? formatMoney(r.profit_total) : ""}
                    </td>
                    <td className="px-2 py-2 text-xs">{r.paymentLabel}</td>
                    <td className="py-2 pl-2 pr-4">
                      {(r.canEdit || r.canVoid) && (
                        <div className="flex justify-end gap-1">
                          {r.canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => setEditing(r.transaction)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {r.canVoid && (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={voiding === r.id}
                              onClick={() => handleVoid(r)}
                            >
                              <Ban className="h-3.5 w-3.5 text-rose-500" />
                            </Button>
                          )}
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
            {rows.map((r) => (
              <div
                key={r.id}
                className={`cursor-pointer bg-white p-3 active:bg-slate-50 ${r.dim ? "opacity-40" : ""}`}
                onClick={() => setSheetRow(r)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800">{r.detail}</span>
                  <span
                    className={`shrink-0 font-bold ${r.income ? "text-emerald-600" : r.expense ? "text-rose-600" : "text-slate-400"}`}
                  >
                    {r.income ? `+${formatMoney(r.income)}` : r.expense ? `-${formatMoney(r.expense)}` : "-"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    <Badge variant={r.kind === "debt" ? "info" : "default"}>{r.categoryLabel}</Badge>
                    {r.statusBadge && <Badge variant={r.statusBadge.variant}>{r.statusBadge.label}</Badge>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{formatDateTime(r.occurred_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <BottomSheet open={!!sheetRow} onOpenChange={(o) => !o && setSheetRow(null)}>
        <BottomSheetContent>
          {sheetRow && (
            <>
              <BottomSheetHeader>
                <BottomSheetTitle>{sheetRow.detail}</BottomSheetTitle>
              </BottomSheetHeader>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">วันที่</div>
                  {formatDateTime(sheetRow.occurred_at)}
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">ชำระ</div>
                  {sheetRow.paymentLabel}
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">รายรับ</div>
                  <span className="text-emerald-600">{sheetRow.income ? formatMoney(sheetRow.income) : "-"}</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">รายจ่าย</div>
                  <span className="text-rose-600">{sheetRow.expense ? formatMoney(sheetRow.expense) : "-"}</span>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">ต้นทุน</div>
                  {sheetRow.cost_total > 0 ? formatMoney(sheetRow.cost_total) : "-"}
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">กำไร</div>
                  <span className="text-indigo-600">
                    {sheetRow.profit_total !== 0 ? formatMoney(sheetRow.profit_total) : "-"}
                  </span>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-50 p-2">
                  <div className="text-[0.65rem] text-slate-400">คงเหลือ</div>
                  {sheetRow.balance !== null ? formatMoney(sheetRow.balance) : "— (ยังไม่มีเงินเข้าจริง)"}
                </div>
              </div>
              {(sheetRow.canEdit || sheetRow.canVoid) && (
                <div className="flex flex-col gap-2 pt-1">
                  {sheetRow.canEdit && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(sheetRow.transaction);
                        setSheetRow(null);
                      }}
                    >
                      ✏️ แก้ไข
                    </Button>
                  )}
                  {sheetRow.canVoid && (
                    <Button variant="danger" disabled={voiding === sheetRow.id} onClick={() => handleVoid(sheetRow)}>
                      🚫 ยกเลิกรายการ (Void)
                    </Button>
                  )}
                </div>
              )}
              <Button variant="ghost" onClick={() => setSheetRow(null)}>
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
