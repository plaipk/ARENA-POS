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
import { formatMoney } from "@/lib/utils";
import { MONTH_NAMES_TH } from "@/lib/period";
import type { MonthlyReport } from "@/lib/types/database";

export function ReportDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: "view" | "close";
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
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

  const isClose = mode === "close";
  const canClose = isClose && report && report.alloc.net_profit > 0;

  // Only reachable in close mode (view mode renders no confirming button —
  // it's just a live preview, nothing to confirm). Saves the allocation
  // permanently, then generates the actual archived PDF for the period.
  async function handleConfirmClose() {
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
      <DialogContent className={isClose ? undefined : "max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>{isClose ? "🔒 ปิดงวด + จัดสรรกำไร" : "📄 รายงานเดือนนี้ (ยังไม่ปิดยอด)"}</DialogTitle>
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

        {/* View mode: full preview styled like the actual PDF, watermarked —
           this is a live snapshot, not the archived record. Nothing to
           confirm here, so no action button below. */}
        {report && !isClose && <ReportPreview report={report} month={month} year={year} />}

        {report && isClose && (
          <div className="text-center text-sm">
            <h4 className="text-slate-400">รอบวันที่: {report.period}</h4>
            <div className="my-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border p-2">
                รายได้รวม
                <br />
                <b>฿{formatMoney(report.total_income)}</b>
              </div>
              <div className="rounded-lg border p-2">
                รายจ่ายรวม
                <br />
                <b>฿{formatMoney(report.total_expense)}</b>
              </div>
            </div>

            <div
              className={`mb-3 rounded-2xl p-3 text-white ${report.alloc.net_profit > 0 ? "bg-emerald-500" : "bg-slate-400"}`}
            >
              <small>กำไรสุทธิสำหรับจัดสรร (Net Profit)</small>
              <h3 className="m-0 text-2xl font-bold">฿{formatMoney(report.alloc.net_profit)}</h3>
            </div>

            <div className="mb-2 rounded-2xl border bg-slate-50 p-3 text-left">
              <small className="mb-1 block font-bold text-indigo-600">การจัดสรรกำไร:</small>
              <Row label="1. ทุนการศึกษา (30%)" value={report.alloc.scholarship} />
              <Row label="2. สำรองฉุกเฉิน (30%)" value={report.alloc.emergency} />
              <Row label="4. ค่าตอบแทน จนท. (10%)" value={report.alloc.staff} bottomBorder />
              <div className="flex justify-between font-bold text-rose-600">
                <span>รวมยอดดึงออกจากบัญชี:</span>
                <span>- ฿{formatMoney(report.alloc.total_out)}</span>
              </div>
              <div className="mt-2 border-t pt-2 text-xs text-emerald-600">
                3. หมุนเวียนสนาม (30% คาไว้ในบัญชี): <b>฿{formatMoney(report.alloc.rotate)}</b>
              </div>
            </div>

            {!canClose && (
              <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                กำไรสุทธิไม่เป็นบวก จึงยังปิดงวดไม่ได้
              </div>
            )}
          </div>
        )}

        {isClose && done && (
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

        {isClose ? (
          <Button variant="danger" disabled={busy || isLoading || !canClose} onClick={handleConfirmClose} className="w-full">
            {busy ? "กำลังดำเนินการ..." : "🔒 ยืนยันปิดงวด + จัดสรร"}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
            ปิด
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bottomBorder }: { label: string; value: number; bottomBorder?: boolean }) {
  return (
    <div className={`flex justify-between text-xs ${bottomBorder ? "mb-1 border-b pb-1" : ""}`}>
      <span>{label}</span> <b>฿{formatMoney(value)}</b>
    </div>
  );
}
