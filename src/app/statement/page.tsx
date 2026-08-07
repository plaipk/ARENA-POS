"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Ban } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
};

function defaultDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
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
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`)
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Transaction[];
    },
  });

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["statement"] });
    invalidate();
  }

  async function handleVoid(t: Transaction) {
    if (!confirm(`ยืนยันจะยกเลิกรายการ: "${t.detail}" ใช่หรือไม่?`)) return;
    const reason = prompt("ระบุเหตุผลการยกเลิก (ไม่บังคับ):") ?? "";
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
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
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

      <Card>
        {isLoading && <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !rows.length && (
          <p className="py-6 text-center text-sm text-slate-400">ไม่พบรายการในช่วงวันที่เลือก</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-400">
                <th className="py-2 pr-2">วันที่</th>
                <th className="px-2 py-2">รายละเอียด</th>
                <th className="px-2 py-2">หมวดหมู่</th>
                <th className="px-2 py-2 text-right">รายรับ</th>
                <th className="px-2 py-2 text-right">รายจ่าย</th>
                <th className="px-2 py-2">ชำระ</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className={`border-b border-slate-50 last:border-0 ${t.is_void ? "opacity-40" : ""}`}>
                  <td className="whitespace-nowrap py-2 pr-2 text-xs text-slate-500">
                    {new Date(t.occurred_at).toLocaleString("th-TH", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
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
                  <td className="px-2 py-2 text-xs">{t.payment_method === "cash" ? "เงินสด" : "โอน"}</td>
                  <td className="py-2 pl-2">
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
      </Card>

      <TransactionEditDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        transaction={editing}
        onSaved={refreshAll}
      />
    </main>
  );
}
