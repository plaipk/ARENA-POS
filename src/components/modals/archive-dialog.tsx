"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { downloadGeneratedPdf } from "@/lib/download-report";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";
import type { ArchiveMonth } from "@/lib/types/database";

export function ArchiveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [busyMonth, setBusyMonth] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: months, isLoading, refetch } = useQuery({
    queryKey: ["report-archive", year],
    enabled: open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_report_archive", { p_year: year });
      if (error) throw error;
      return (data as ArchiveMonth[]).filter((m) => m.row_count > 0 || m.has_pdf || m.allocated).reverse();
    },
  });

  async function openPdf(m: ArchiveMonth) {
    if (!m.storage_path) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("reports").createSignedUrl(m.storage_path, 60);
    if (error || !data) {
      toast.error("เปิดไฟล์ไม่สำเร็จ: " + error?.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function generate(m: ArchiveMonth) {
    setBusyMonth(m.month);
    try {
      const res = await downloadGeneratedPdf(m.month, year);
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
      queryClient.invalidateQueries({ queryKey: ["report-archive"] });
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBusyMonth(null);
    }
  }

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2, now.getFullYear() - 3];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>🗂️ รายงานย้อนหลัง</DialogTitle>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-[var(--ink-soft)]">ปี</span>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className="ml-auto">ปุ่มในหน้านี้ไม่จัดสรรยอด</Badge>
          </div>
        </DialogHeader>

        {isLoading && <p className="py-6 text-center text-sm text-[var(--ink-soft)]">กำลังโหลด...</p>}
        {!isLoading && !months?.length && (
          <p className="py-6 text-center text-sm text-[var(--ink-soft)]">ยังไม่มีข้อมูลของปี {year}</p>
        )}

        <div className="space-y-2">
          {months?.map((m) => (
            <div key={m.month} className="sk-well rounded-2xl p-3">
              <div className="flex items-start justify-between">
                <div>
                  <b className="text-sm">
                    {m.month_name} {year}
                  </b>
                  <div className="text-[0.62rem] text-[var(--ink-soft)]">รอบ {m.period}</div>
                </div>
                <Badge variant={m.allocated ? "success" : "default"}>
                  {m.allocated ? "จัดสรรแล้ว" : "ยังไม่จัดสรร"}
                </Badge>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[0.62rem]">
                <div className="sk-raised-sm rounded-lg bg-[var(--surface)] py-1">
                  รายรับ
                  <br />
                  <b className="text-sm text-emerald-600">{formatMoney(m.total_income)}</b>
                </div>
                <div className="sk-raised-sm rounded-lg bg-[var(--surface)] py-1">
                  รายจ่าย
                  <br />
                  <b className="text-sm text-rose-600">{formatMoney(m.total_expense)}</b>
                </div>
                <div className="sk-raised-sm rounded-lg bg-[var(--surface)] py-1">
                  กำไรสุทธิ
                  <br />
                  <b className="text-sm text-indigo-600">{formatMoney(m.alloc.net_profit)}</b>
                </div>
              </div>

              <div className="mt-2 text-[0.6rem] text-[var(--ink-soft)]">
                {m.has_pdf ? `📄 ไฟล์ล่าสุด ${m.pdf_created_at ?? ""}` : "📄 ยังไม่เคยพิมพ์ PDF"}
                {m.allocated && ` • 🔒 จัดสรรเมื่อ ${m.alloc_date} (${formatMoney(m.alloc.total_out)} บาท)`}
              </div>

              <div className="mt-2 flex gap-2">
                {m.has_pdf && (
                  <Button size="sm" className="flex-1" onClick={() => openPdf(m)}>
                    เปิด PDF
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={busyMonth === m.month}
                  onClick={() => generate(m)}
                >
                  {busyMonth === m.month ? "กำลังสร้าง..." : m.has_pdf ? "สร้างใหม่" : "สร้าง PDF"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
