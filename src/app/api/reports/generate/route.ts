import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { registerThaiFonts } from "@/lib/pdf/fonts";
import { MonthlyReportDocument } from "@/lib/pdf/monthly-report-document";
import { MONTH_NAMES_TH } from "@/lib/period";
import type { MonthlyReport } from "@/lib/types/database";

export const runtime = "nodejs";

/**
 * Renders the monthly PDF and persists it to Storage. This never touches the ledger
 * itself (mirrors the original's [16] rule: generating a PDF is safe and repeatable;
 * only save_allocation_entry — called separately, before this route — closes the
 * period). Multiple report rows per month are kept intentionally, so regenerating a
 * report doesn't destroy the previous file's history like the original Drive folder did.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const month = Number(body?.month);
  const year = Number(body?.year);
  if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) {
    return NextResponse.json({ error: "เดือน/ปีไม่ถูกต้อง" }, { status: 400 });
  }

  const { data: report, error: reportError } = await supabase.rpc("get_report_by_month", {
    p_month: month,
    p_year: year,
  });
  if (reportError || !report) {
    return NextResponse.json({ error: reportError?.message ?? "ดึงข้อมูลรายงานไม่สำเร็จ" }, { status: 500 });
  }

  registerThaiFonts();
  const buffer = await renderToBuffer(
    MonthlyReportDocument({ report: report as MonthlyReport, month, year }),
  );

  const fileName = `สรุปรายรับรายจ่าย_${MONTH_NAMES_TH[month]}_${year}.pdf`;
  const storagePath = `${year}/${String(month).padStart(2, "0")}-${Date.now()}.pdf`;

  let signedUrl: string | null = null;
  try {
    const admin = createServiceRoleClient();
    const { error: uploadError } = await admin.storage
      .from("reports")
      .upload(storagePath, buffer, { contentType: "application/pdf" });
    if (uploadError) throw uploadError;

    await admin.from("reports").insert({
      month,
      year,
      period: (report as MonthlyReport).period,
      file_name: fileName,
      storage_path: storagePath,
      created_by: user.id,
    });

    const { data: signed } = await admin.storage.from("reports").createSignedUrl(storagePath, 3600);
    signedUrl = signed?.signedUrl ?? null;
  } catch {
    // Storage/DB history is best-effort — the base64 bytes below still let the
    // user download the file even if persisting it failed (same fallback the
    // original had for a broken Drive folder).
  }

  return NextResponse.json({
    bytes: buffer.toString("base64"),
    fileName,
    url: signedUrl,
  });
}
