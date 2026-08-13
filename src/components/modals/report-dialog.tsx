"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { downloadGeneratedPdf } from "@/lib/download-report";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportPreview } from "@/components/documents/report-preview";
import { formatMoney } from "@/lib/utils";
import { MONTH_NAMES_TH, isPeriodOver } from "@/lib/period";
import type { MonthlyReport, ProfitAllocation } from "@/lib/types/database";

/** "ดูรายงานเดือนนี้" — a live, PDF-styled preview of any month, with ปิดงวด
 * folded in as one action at the bottom instead of a separate button/dialog.
 * ปิดงวด only unlocks once that period's 25th has actually passed — closing
 * early would lock in numbers for a month that isn't over yet. Once a
 * period is closed the button is replaced entirely (not just disabled) by
 * a closed-state card with a "ยกเลิกการปิดงวด" escape hatch, for when the
 * underlying data turns out to have been wrong. */
export function ReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidatePosData();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ fileName: string; url: string | null } | null>(null);

  // Clear the previous run's result the moment the dialog opens again, or
  // the moment a different month/year is picked — otherwise a PDF-success
  // banner from one month keeps showing while looking at an unrelated one.
  // Runs during render — onOpenChange never fires when the parent flips
  // `open` externally (no DialogTrigger involved here), only for
  // Radix-initiated close transitions.
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevPeriod, setPrevPeriod] = useState(`${month}-${year}`);
  const period = `${month}-${year}`;
  if (open !== prevOpen || period !== prevPeriod) {
    setPrevOpen(open);
    setPrevPeriod(period);
    setDone(null);
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

  const { data: existingAlloc } = useQuery({
    queryKey: ["profit-allocation", month, year],
    enabled: open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profit_allocations")
        .select("*")
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();
      if (error) throw error;
      return data as ProfitAllocation | null;
    },
  });

  function invalidateAll() {
    invalidate();
    queryClient.invalidateQueries({ queryKey: ["profit-allocation", month, year] });
    queryClient.invalidateQueries({ queryKey: ["report-by-month", month, year] });
  }

  const periodOver = isPeriodOver(month, year);

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
    invalidateAll();

    try {
      const res = await downloadGeneratedPdf(month, year);
      setDone(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // For a period whose net profit isn't positive — save_allocation_entry
  // refuses those outright (nothing to allocate). This still marks the
  // period as reviewed/closed instead of leaving it stuck at "ยังไม่จัดสรร"
  // forever, just without withdrawing anything.
  async function handleCloseNoAlloc() {
    if (
      !confirm(
        "ยืนยันปิดงวดนี้?\n(กำไรสุทธิไม่เป็นบวก จึงไม่มีเงินให้จัดสรร แต่จะถูกบันทึกว่าปิดงวดแล้ว เปลี่ยนกลับไม่ได้)",
      )
    )
      return;
    setBusy(true);
    const supabase = createClient();
    const { data: res, error } = await supabase.rpc("close_period_without_allocation", {
      p_month: month,
      p_year: year,
    });
    if (error || !res?.ok) {
      setBusy(false);
      toast.error("ปิดงวดไม่สำเร็จ: " + (error?.message ?? res?.message));
      return;
    }
    if (res.message) toast.info(res.message);
    invalidateAll();

    try {
      const pdfRes = await downloadGeneratedPdf(month, year);
      setDone(pdfRes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  // Escape hatch for "ลงข้อมูลผิดแล้วปิดงวดไปแล้วทำไงดี" — reverses whatever
  // this close actually did (voids the withdrawal transaction + deletes its
  // reserve-fund entry if there was one) and deletes the allocation row, so
  // the period goes back to being unclosed. Fix the data, close again.
  async function handleReopen() {
    if (
      !confirm(
        "ยืนยันยกเลิกการปิดงวดนี้?\n(ใช้เมื่อพบว่าลงข้อมูลผิดก่อนปิดงวด — เงินที่เคยดึงออกไปจะถูกคืนอัตโนมัติ แก้ไขข้อมูลแล้วปิดงวดใหม่ได้เลย)",
      )
    )
      return;
    setBusy(true);
    const supabase = createClient();
    const { data: res, error } = await supabase.rpc("reopen_period", { p_month: month, p_year: year });
    setBusy(false);
    if (error || !res?.ok) {
      toast.error("ยกเลิกการปิดงวดไม่สำเร็จ: " + (error?.message ?? res?.message));
      return;
    }
    toast.success(res.message ?? "ยกเลิกการปิดงวดสำเร็จ!");
    setDone(null);
    invalidateAll();
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

        {report && existingAlloc && (
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 p-3">
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-600">
              ปิดงวดแล้ว
            </p>
            <p className="mb-2 text-xs text-slate-600">
              ปิดเมื่อ {new Date(existingAlloc.created_at).toLocaleString("th-TH")} — กำไรสุทธิ{" "}
              {formatMoney(existingAlloc.net_profit)} บาท
              {existingAlloc.total_out > 0
                ? ` (จัดสรรออกไป ${formatMoney(existingAlloc.total_out)} บาท)`
                : " (ไม่มีเงินให้จัดสรร)"}
            </p>
            <Button
              variant="outline"
              className="w-full border-rose-300 text-rose-600 hover:bg-rose-50"
              disabled={busy}
              onClick={handleReopen}
            >
              {busy ? "กำลังดำเนินการ..." : "↩️ ยกเลิกการปิดงวด (ลงข้อมูลผิด)"}
            </Button>
          </div>
        )}

        {report && !existingAlloc && (
          <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/40 p-3">
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-rose-500">
              โซนปิดงวด — ทำครั้งเดียวต่อเดือน เปลี่ยนกลับไม่ได้
            </p>

            {!periodOver && (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  รอบนี้ยังไม่จบ — ปิดงวดได้ตั้งแต่วันที่ 26 {MONTH_NAMES_TH[month]} {year} เป็นต้นไป
                </p>
                <Button variant="danger" className="w-full" disabled>
                  🔒 ปิดงวด + จัดสรรกำไร
                </Button>
              </>
            )}

            {periodOver && report.alloc.net_profit > 0 && (
              <Button variant="danger" className="w-full" disabled={busy} onClick={handleClosePeriod}>
                {busy ? "กำลังดำเนินการ..." : "🔒 ปิดงวด + จัดสรรกำไร"}
              </Button>
            )}

            {periodOver && report.alloc.net_profit <= 0 && (
              <>
                <p className="mb-2 text-xs text-amber-600">
                  กำไรสุทธิรอบนี้เท่ากับ {formatMoney(report.alloc.net_profit)} บาท (ไม่เป็นบวก) จึงไม่มีเงินให้จัดสรร
                  — ปิดงวดแบบไม่จัดสรรได้แทน (บันทึกว่าตรวจแล้ว แต่ไม่มีการดึงเงินออก)
                </p>
                <Button
                  variant="outline"
                  className="w-full border-amber-400 text-amber-700 hover:bg-amber-50"
                  disabled={busy}
                  onClick={handleCloseNoAlloc}
                >
                  {busy ? "กำลังดำเนินการ..." : "🔒 ปิดงวดแบบไม่จัดสรร"}
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
