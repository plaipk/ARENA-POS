"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PiggyBank } from "lucide-react";
import { useReserveFundEntries } from "@/lib/hooks/use-reserve-fund";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReserveFundEntryDialog } from "@/components/modals/reserve-fund-entry-dialog";
import { formatMoney } from "@/lib/utils";

export default function ReserveFundPage() {
  const queryClient = useQueryClient();
  const { data: entries = [], isLoading } = useReserveFundEntries();
  const [addOpen, setAddOpen] = useState(false);

  const balance = useMemo(() => entries.reduce((s, e) => s + e.amount, 0), [entries]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["reserve-fund-entries"] });
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 p-3 pb-8">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">🏦 เงินสำรองสนาม (สำรองฉุกเฉิน)</h1>
        <Button className="ml-auto" onClick={() => setAddOpen(true)}>
          + เพิ่มรายการ
        </Button>
      </div>

      <Card className="bg-slate-900 text-white">
        <p className="text-xs text-slate-300">ยอดคงเหลือสะสม</p>
        <p className="text-2xl font-bold">{formatMoney(balance)} บาท</p>
      </Card>

      <Card className="p-0">
        {isLoading && <p className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !entries.length && (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            ยังไม่มีรายการ กด &quot;+ เพิ่มรายการ&quot; เพื่อเริ่ม
          </p>
        )}

        {/* Desktop: table */}
        {!isLoading && entries.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-400">
                  <th className="py-2 pl-4 pr-2">รายการ / ช่วงเวลา</th>
                  <th className="px-2 py-2">ที่มา</th>
                  <th className="px-2 py-2">หมายเหตุ</th>
                  <th className="px-2 py-2 text-right">จำนวนเงิน</th>
                  <th className="py-2 pl-2 pr-4">วันที่บันทึก</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pl-4 pr-2 font-medium text-slate-800">{e.period}</td>
                    <td className="px-2 py-2">
                      <Badge variant={e.allocation_id ? "info" : "default"}>
                        {e.allocation_id ? "จากปิดงวด" : "บันทึกเอง"}
                      </Badge>
                    </td>
                    <td className="max-w-[200px] truncate px-2 py-2 text-xs text-slate-500" title={e.note ?? ""}>
                      {e.note ?? "-"}
                    </td>
                    <td className={`px-2 py-2 text-right font-semibold ${e.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {e.amount >= 0 ? "+" : ""}
                      {formatMoney(e.amount)}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-2 pr-4 text-xs text-slate-400">
                      {new Date(e.created_at).toLocaleDateString("th-TH", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile: card list */}
        {!isLoading && entries.length > 0 && (
          <div className="m-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 md:hidden">
            {entries.map((e) => (
              <div key={e.id} className="bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <PiggyBank className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    <b className="truncate text-sm text-slate-800">{e.period}</b>
                  </span>
                  <span className={`shrink-0 font-bold ${e.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {e.amount >= 0 ? "+" : ""}
                    {formatMoney(e.amount)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    <Badge variant={e.allocation_id ? "info" : "default"}>
                      {e.allocation_id ? "จากปิดงวด" : "บันทึกเอง"}
                    </Badge>
                    {e.note && <span className="truncate text-xs text-slate-400">{e.note}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(e.created_at).toLocaleDateString("th-TH", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ReserveFundEntryDialog open={addOpen} onOpenChange={setAddOpen} onSaved={invalidate} />
    </main>
  );
}
