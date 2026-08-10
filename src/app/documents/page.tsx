"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useReportArchive } from "@/lib/hooks/use-report-archive";
import { downloadGeneratedPdf } from "@/lib/download-report";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { ReportDialog } from "@/components/modals/report-dialog";
import type { ArchiveMonth } from "@/lib/types/database";

function formatDate(d: Date) {
  return d.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** เอกสาร = รายงานประจำเดือน (PDF สรุปรายรับรายจ่าย + การจัดสรรกำไร) เท่านั้น. */
export default function DocumentsPage() {
  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2, now.getFullYear() - 3];

  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [sheetMonth, setSheetMonth] = useState<ArchiveMonth | null>(null);
  const [pdfListMonth, setPdfListMonth] = useState<ArchiveMonth | null>(null);
  const [busyMonth, setBusyMonth] = useState<number | null>(null);
  const [reportDialog, setReportDialog] = useState<null | "view" | "close">(null);

  const queryClient = useQueryClient();
  const { data: months = [], isLoading } = useReportArchive(year);

  function invalidateReports() {
    queryClient.invalidateQueries({ queryKey: ["report-archive"] });
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return months
      .filter((m) => !q || m.month_name.toLowerCase().includes(q) || m.period.toLowerCase().includes(q))
      .map((m) => ({ month: m, sortDate: new Date(year, m.month - 1, 25) }));
  }, [months, year, search]);

  async function openPdfFile(storagePath: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("reports").createSignedUrl(storagePath, 60);
    if (error || !data) {
      toast.error("เปิดไฟล์ไม่สำเร็จ: " + error?.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  // One PDF -> open it directly. More than one (เผลอกดสร้างซ้ำในเดือนนั้น) ->
  // show every version dated, so any of them can be reopened to re-check.
  function openReportPdf(m: ArchiveMonth) {
    if (!m.pdf_versions.length) return;
    if (m.pdf_versions.length === 1) {
      openPdfFile(m.pdf_versions[0].storage_path);
      return;
    }
    setPdfListMonth(m);
  }

  async function generateReportPdf(m: ArchiveMonth) {
    setBusyMonth(m.month);
    try {
      const res = await downloadGeneratedPdf(m.month, year);
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
      invalidateReports();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBusyMonth(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 p-3 pb-8">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">📄 เอกสาร (รายงานประจำเดือน)</h1>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>ปี</Label>
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
          </div>
          <div className="min-w-[160px] flex-1">
            <Label>ค้นหา (ชื่อเดือน / รอบวันที่)</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="พิมพ์เพื่อค้นหา..." />
          </div>
          <Button
            variant="outline"
            className="border-slate-800 bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => setReportDialog("view")}
          >
            📄 ดูรายงานเดือนนี้ (รายละเอียด)
          </Button>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading && <p className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !rows.length && (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            {months.length ? "ไม่พบเอกสาร" : `ยังไม่มีรายงานของปี ${year}`}
          </p>
        )}

        {/* Desktop: table + inline row actions */}
        {!isLoading && rows.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-400">
                  <th className="py-2 pl-4 pr-2">รายงานประจำเดือน</th>
                  <th className="px-2 py-2">รอบ</th>
                  <th className="px-2 py-2">สถานะ</th>
                  <th className="py-2 pl-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ month: m, sortDate }) => (
                  <tr key={m.month} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pl-4 pr-2 font-medium text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                        {m.month_name} {year}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500">
                      {m.period}
                      <div className="text-[0.65rem] text-slate-400">{formatDate(sortDate)}</div>
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant={m.allocated ? "success" : "default"}>
                        {m.allocated ? "จัดสรรแล้ว" : "ยังไม่จัดสรร"}
                      </Badge>
                    </td>
                    <td className="py-2 pl-2 pr-4">
                      <div className="flex justify-end gap-1">
                        {m.pdf_versions.length > 0 && (
                          <Button variant="ghost" size="sm" onClick={() => openReportPdf(m)}>
                            เปิด PDF{m.pdf_versions.length > 1 && ` (${m.pdf_versions.length})`}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyMonth === m.month}
                          onClick={() => generateReportPdf(m)}
                        >
                          {busyMonth === m.month ? "กำลังสร้าง..." : m.has_pdf ? "สร้างใหม่" : "สร้าง PDF"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile: seamless card list, tap a row to open the action sheet */}
        {!isLoading && rows.length > 0 && (
          <div className="m-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 md:hidden">
            {rows.map(({ month: m, sortDate }) => (
              <div
                key={m.month}
                className="cursor-pointer bg-white p-3 active:bg-slate-50"
                onClick={() => setSheetMonth(m)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    <b className="truncate text-sm text-slate-800">
                      {m.month_name} {year}
                    </b>
                  </span>
                  <Badge variant={m.allocated ? "success" : "default"} className="shrink-0">
                    {m.allocated ? "จัดสรรแล้ว" : "ยังไม่จัดสรร"}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-400">รอบ {m.period}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatDate(sortDate)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="border-2 border-rose-200 bg-rose-50/40">
        <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-rose-500">
          โซนปิดงวด — ทำครั้งเดียวต่อเดือน เปลี่ยนกลับไม่ได้
        </p>
        <p className="mb-2 text-xs text-slate-500">
          กดปุ่มนี้ก็ต่อเมื่อจะจัดสรรกำไรของรอบบัญชีจริงๆ — ถ้าแค่อยากดูตัวเลข ใช้ปุ่ม
          &quot;ดูรายงานเดือนนี้&quot; ด้านบนแทน ปลอดภัยกว่า
        </p>
        <Button variant="danger" className="w-full" onClick={() => setReportDialog("close")}>
          🔒 ปิดงวด + จัดสรรกำไร
        </Button>
      </Card>

      <BottomSheet open={!!sheetMonth} onOpenChange={(o) => !o && setSheetMonth(null)}>
        <BottomSheetContent>
          {sheetMonth && (
            <>
              <BottomSheetHeader>
                <BottomSheetTitle>
                  {sheetMonth.month_name} {year}
                </BottomSheetTitle>
              </BottomSheetHeader>
              <div className="flex flex-col gap-2 pt-1">
                {sheetMonth.pdf_versions.length > 0 && (
                  <Button onClick={() => openReportPdf(sheetMonth)}>
                    เปิด PDF{sheetMonth.pdf_versions.length > 1 && ` (${sheetMonth.pdf_versions.length})`}
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={busyMonth === sheetMonth.month}
                  onClick={() => generateReportPdf(sheetMonth)}
                >
                  {busyMonth === sheetMonth.month ? "กำลังสร้าง..." : sheetMonth.has_pdf ? "สร้างใหม่" : "สร้าง PDF"}
                </Button>
                <Button variant="ghost" onClick={() => setSheetMonth(null)}>
                  ปิด
                </Button>
              </div>
            </>
          )}
        </BottomSheetContent>
      </BottomSheet>

      <BottomSheet open={!!pdfListMonth} onOpenChange={(o) => !o && setPdfListMonth(null)}>
        <BottomSheetContent>
          {pdfListMonth && (
            <>
              <BottomSheetHeader>
                <BottomSheetTitle>
                  PDF ที่เคยสร้างไว้ — {pdfListMonth.month_name} {year} ({pdfListMonth.pdf_versions.length} ไฟล์)
                </BottomSheetTitle>
              </BottomSheetHeader>
              <div className="flex flex-col gap-2 pt-1">
                {pdfListMonth.pdf_versions.map((v) => (
                  <Button
                    key={v.storage_path}
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => {
                      openPdfFile(v.storage_path);
                      setPdfListMonth(null);
                    }}
                  >
                    <span>เปิดไฟล์</span>
                    <span className="text-xs text-slate-400">สร้างเมื่อ {v.created_at}</span>
                  </Button>
                ))}
                <Button variant="ghost" onClick={() => setPdfListMonth(null)}>
                  ปิด
                </Button>
              </div>
            </>
          )}
        </BottomSheetContent>
      </BottomSheet>

      <ReportDialog
        mode="view"
        open={reportDialog === "view"}
        onOpenChange={(o) => setReportDialog(o ? "view" : null)}
      />
      <ReportDialog
        mode="close"
        open={reportDialog === "close"}
        onOpenChange={(o) => setReportDialog(o ? "close" : null)}
      />
    </main>
  );
}
