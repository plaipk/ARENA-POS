"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, FileSpreadsheet, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useDocuments, useReportArchive } from "@/lib/hooks/use-documents";
import { downloadGeneratedPdf } from "@/lib/download-report";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { DocumentUploadDialog } from "@/components/documents/document-upload-dialog";
import type { ArchiveMonth, DocumentRecord } from "@/lib/types/database";

type DocRow =
  | { id: string; kind: "report"; title: string; subtitle: string; sortDate: Date; report: ArchiveMonth }
  | { id: string; kind: "document"; title: string; subtitle: string; sortDate: Date; document: DocumentRecord };

function formatDate(d: Date) {
  return d.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DocumentsPage() {
  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2, now.getFullYear() - 3];

  const [year, setYear] = useState(now.getFullYear());
  const [typeFilter, setTypeFilter] = useState<"all" | "report" | "document">("all");
  const [search, setSearch] = useState("");
  const [sheetRow, setSheetRow] = useState<DocRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyReportMonth, setBusyReportMonth] = useState<number | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: months = [], isLoading: loadingReports } = useReportArchive(year);
  const { data: documents = [], isLoading: loadingDocuments } = useDocuments();

  function invalidateDocuments() {
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  }
  function invalidateReports() {
    queryClient.invalidateQueries({ queryKey: ["report-archive"] });
  }

  const rows = useMemo<DocRow[]>(() => {
    const reportRows: DocRow[] = months.map((m) => ({
      id: `report-${m.month}-${year}`,
      kind: "report",
      title: `รายงานประจำเดือน ${m.month_name} ${year}`,
      subtitle: `รอบ ${m.period}`,
      sortDate: new Date(year, m.month - 1, 25),
      report: m,
    }));
    const documentRows: DocRow[] = documents
      .filter((d) => new Date(d.uploaded_at).getFullYear() === year)
      .map((d) => ({
        id: d.id,
        kind: "document",
        title: d.title,
        subtitle: d.category || "เอกสารทั่วไป",
        sortDate: new Date(d.uploaded_at),
        document: d,
      }));

    const q = search.trim().toLowerCase();
    return [...reportRows, ...documentRows]
      .filter((r) => typeFilter === "all" || r.kind === typeFilter)
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q))
      .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
  }, [months, documents, year, typeFilter, search]);

  const isLoading = loadingReports || loadingDocuments;

  async function openReportPdf(m: ArchiveMonth) {
    if (!m.storage_path) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("reports").createSignedUrl(m.storage_path, 60);
    if (error || !data) {
      toast.error("เปิดไฟล์ไม่สำเร็จ: " + error?.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function generateReportPdf(m: ArchiveMonth) {
    setBusyReportMonth(m.month);
    try {
      const res = await downloadGeneratedPdf(m.month, year);
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
      invalidateReports();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBusyReportMonth(null);
    }
  }

  async function openDocumentFile(d: DocumentRecord) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 60);
    if (error || !data) {
      toast.error("เปิดไฟล์ไม่สำเร็จ: " + error?.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDeleteDocument(d: DocumentRecord) {
    if (!confirm(`ยืนยันลบเอกสาร "${d.title}"?`)) return;
    setSheetRow(null);
    setDeletingDocId(d.id);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("delete_document", { p_id: d.id });
    setDeletingDocId(null);
    if (error || !data?.ok) {
      toast.error((error?.message ?? data?.message) || "ลบไม่สำเร็จ");
      return;
    }
    if (data.storage_path) await supabase.storage.from("documents").remove([data.storage_path]);
    toast.success(data.message ?? "ลบเอกสารสำเร็จ!");
    invalidateDocuments();
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 p-3 pb-8">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">📄 เอกสาร</h1>
        <Button className="ml-auto" onClick={() => setUploadOpen(true)}>
          + เพิ่มเอกสาร
        </Button>
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
          <div>
            <Label>ประเภท</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                <SelectItem value="report">รายงานประจำเดือน</SelectItem>
                <SelectItem value="document">เอกสารอื่นๆ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px] flex-1">
            <Label>ค้นหา</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="พิมพ์เพื่อค้นหา..." />
          </div>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading && <p className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !rows.length && (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            {documents.length || months.length ? "ไม่พบเอกสาร" : 'ยังไม่มีเอกสาร กด "+ เพิ่มเอกสาร" เพื่อเริ่ม'}
          </p>
        )}

        {/* Desktop: table + inline row actions */}
        {!isLoading && rows.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-400">
                  <th className="py-2 pl-4 pr-2">ชื่อเอกสาร</th>
                  <th className="px-2 py-2">รายละเอียด</th>
                  <th className="px-2 py-2">วันที่</th>
                  <th className="py-2 pl-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pl-4 pr-2 font-medium text-slate-800">
                      <div className="flex items-center gap-1.5">
                        {r.kind === "report" ? (
                          <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        {r.title}
                        {r.kind === "report" && (
                          <Badge variant={r.report.allocated ? "success" : "default"}>
                            {r.report.allocated ? "จัดสรรแล้ว" : "ยังไม่จัดสรร"}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500">{r.subtitle}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">{formatDate(r.sortDate)}</td>
                    <td className="py-2 pl-2 pr-4">
                      <div className="flex justify-end gap-1">
                        {r.kind === "report" ? (
                          <>
                            {r.report.has_pdf && (
                              <Button variant="ghost" size="sm" onClick={() => openReportPdf(r.report)}>
                                เปิด PDF
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyReportMonth === r.report.month}
                              onClick={() => generateReportPdf(r.report)}
                            >
                              {busyReportMonth === r.report.month
                                ? "กำลังสร้าง..."
                                : r.report.has_pdf
                                  ? "สร้างใหม่"
                                  : "สร้าง PDF"}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => openDocumentFile(r.document)}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deletingDocId === r.document.id}
                              onClick={() => handleDeleteDocument(r.document)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                            </Button>
                          </>
                        )}
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
            {rows.map((r) => (
              <div
                key={r.id}
                className="cursor-pointer bg-white p-3 active:bg-slate-50"
                onClick={() => setSheetRow(r)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {r.kind === "report" ? (
                      <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <b className="truncate text-sm text-slate-800">{r.title}</b>
                  </span>
                  {r.kind === "report" && (
                    <Badge variant={r.report.allocated ? "success" : "default"} className="shrink-0">
                      {r.report.allocated ? "จัดสรรแล้ว" : "ยังไม่จัดสรร"}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-400">{r.subtitle}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatDate(r.sortDate)}</span>
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
                <BottomSheetTitle>{sheetRow.title}</BottomSheetTitle>
              </BottomSheetHeader>
              <div className="flex flex-col gap-2 pt-1">
                {sheetRow.kind === "report" ? (
                  <>
                    {sheetRow.report.has_pdf && (
                      <Button onClick={() => openReportPdf(sheetRow.report)}>เปิด PDF</Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={busyReportMonth === sheetRow.report.month}
                      onClick={() => generateReportPdf(sheetRow.report)}
                    >
                      {busyReportMonth === sheetRow.report.month
                        ? "กำลังสร้าง..."
                        : sheetRow.report.has_pdf
                          ? "สร้างใหม่"
                          : "สร้าง PDF"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={() => openDocumentFile(sheetRow.document)}>เปิดไฟล์</Button>
                    <Button variant="danger" onClick={() => handleDeleteDocument(sheetRow.document)}>
                      ลบเอกสาร
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={() => setSheetRow(null)}>
                  ปิด
                </Button>
              </div>
            </>
          )}
        </BottomSheetContent>
      </BottomSheet>

      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={invalidateDocuments} />
    </main>
  );
}
