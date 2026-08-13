"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { downloadGeneratedPdf } from "@/lib/download-report";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportPreview } from "@/components/documents/report-preview";
import { MONTH_NAMES_TH, isPeriodOver } from "@/lib/period";
import type { MonthlyReport } from "@/lib/types/database";

/** "ดูรายงานเดือนนี้" — a live, PDF-styled preview of any month, with ปิดงวด
 * folded in as one action at the bottom instead of a separate button/dialog.
 * ปิดงวด only unlocks once that period's 25th has actually passed — closing
 * early would lock in numbers for a month that isn't over yet. */
export function ReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidatePosData();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ fileName: string; url: string | null } | null>(null);

  // Clear the previous run's result the moment the dialog opens again. Runs
  // during render — onOpenChange never fires when the parent flips `open`
  // externally (no DialogTrigger involved here), only for Radix-initiated
  // close transitions, so the old success banner would otherwise linger.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setDone(null);
  }

  const { data: report, isLoading } = useQuery({
    queryKey: ["report-by-month", month, year],
    enabled: open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_report_by_month", { p_month: month, p_year: year });
      if (error) throw error;
      return data as MonthlyReport;
    },
  });

  const periodOver = isPeriodOver(month, year);
  const canClose = !!report && report.alloc.net_profit > 0 && periodOver;

  async function handleClosePeriod() {
    if (!confirm("ยืนยันการบันทึกยอดจัดสรรลงบัญชี?\n(รอบนี้จะถูกปิดงวดถาวร)")) return;
    setBusy(true);
    const supabase = createClient();
    const { data: allocRes, error } = await supabase.rpc("save_allocation_entry", { p_month: month, p_year: year });
    if (error || !allocRes?.ok) {
      setBusy(false);
      toast.error("บันทึกจัดสรรไม่สำเร็จ: " + (error?.message ?? allocRes?.message));
      return;
    }
    if (allocRes.message) toast.info(allocRes.message);
    invalidate();

    try {
      const res = await downloadGeneratedPdf(month, year);
      setDone(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const years = [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>📄 รายงานเดือนนี้ (ยังไม่ปิดยอด)</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES_TH.slice(1).map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger>
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
        </div>

        {isLoading && <p className="py-6 text-center text-sm text-slate-400">กำลังประมวลผล...</p>}

        {report && <ReportPreview report={report} month={month} year={year} />}

        {done && (
          <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
            สร้าง PDF สำเร็จ: <b>{done.fileName}</b>
            {done.url && (
              <a href={done.url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                <Button variant="outline" size="sm" className="w-full">
                  เปิด / ดาวน์โหลดจาก Storage
                </Button>
              </a>
            )}
          </div>
        )}

        {report && !done && (
          <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/40 p-3">
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-rose-500">
              โซนปิดงวด — ทำครั้งเดียวต่อเดือน เปลี่ยนกลับไม่ได้
            </p>
            {!periodOver && (
              <p className="mb-2 text-xs text-slate-500">
                รอบนี้ยังไม่จบ — ปิดงวดได้ตั้งแต่วันที่ 26 {MONTH_NAMES_TH[month]} {year} เป็นต้นไป
              </p>
            )}
            {periodOver && report.alloc.net_profit <= 0 && (
              <p className="mb-2 text-xs text-amber-600">กำไรสุทธิไม่เป็นบวก จึงยังปิดงวดไม่ได้</p>
            )}
            <Button variant="danger" className="w-full" disabled={busy || !canClose} onClick={handleClosePeriod}>
              {busy ? "กำลังดำเนินการ..." : "🔒 ปิดงวด + จัดสรรกำไร"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
