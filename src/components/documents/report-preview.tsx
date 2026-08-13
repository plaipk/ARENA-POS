import { MONTH_NAMES_TH } from "@/lib/period";
import { formatMoney } from "@/lib/utils";
import type { MonthlyReport } from "@/lib/types/database";

/** On-screen replica of MonthlyReportDocument (the actual PDF) — same
 * sections/order/numbers, styled to match, so "ดูรายงานเดือนนี้" shows
 * exactly what the eventual PDF will say without generating a file. Carries
 * a "ยังไม่ปิดยอด" watermark since, unlike the archived PDF, these numbers
 * are live and can still change until ปิดงวด is actually run. */
export function ReportPreview({ report, month, year }: { report: MonthlyReport; month: number; year: number }) {
  const a = report.alloc;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700 sm:p-6 sm:text-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 flex select-none items-center justify-center overflow-hidden"
      >
        <span className="rotate-[-28deg] whitespace-nowrap text-4xl font-extrabold text-rose-500/15 sm:text-6xl">
          ยังไม่ปิดยอด
        </span>
      </div>

      <div className="relative text-center">
        <h2 className="text-sm font-bold text-indigo-900 sm:text-lg">สรุปรายรับ-รายจ่าย สนามฟุตบอล</h2>
        <h3 className="text-xs font-semibold text-slate-700 sm:text-base">
          ประจำเดือน {MONTH_NAMES_TH[month]} {year}
        </h3>
        <p className="text-[0.65rem] text-slate-500 sm:text-xs">(รอบวันที่ {report.period})</p>
      </div>

      <p className="relative mt-3 text-right">
        <span className="font-bold">เงินทุนตั้งต้น: </span>
        {formatMoney(report.prev_balance)} บาท
      </p>

      <SectionTitle>รายละเอียดรายรับ</SectionTitle>
      {report.product_sales_total > 0 && (
        <ReportRow
          label={
            <>
              - รายได้ขายสินค้า{" "}
              <span className="text-[0.65rem] text-emerald-600">
                (กำไรส่วนนี้: {formatMoney(report.total_profit_from_sales)} บาท)
              </span>
            </>
          }
          value={report.product_sales_total}
        />
      )}
      {report.other_income_items.map((item, i) => (
        <ReportRow key={i} label={`- ${item.name}`} value={item.amount} />
      ))}
      <ReportRow bold label="รายรับรวมทั้งสิ้น" value={report.total_income} />

      <SectionTitle>รายละเอียดรายจ่าย</SectionTitle>
      {report.stock_expense > 0 && <ReportRow label="- ซื้อของ / เติมสินค้า (ยอดรวม)" value={report.stock_expense} />}
      {report.general_expenses.map((item, i) => (
        <ReportRow key={i} label={`- ${item.name}`} value={item.amount} />
      ))}
      <ReportRow bold label="รายจ่ายรวมทั้งสิ้น" value={report.total_expense} />

      <div className="relative mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <p className="mb-1 text-[0.65rem] text-slate-500">
          กำไรสุทธิรอบนี้ (ค่าเช่าสนาม + กำไรขายของ - รายจ่ายเบ็ดเตล็ด)
        </p>
        <p className="text-right text-sm font-bold text-emerald-700 sm:text-base">
          {formatMoney(report.rent_income_total)} + {formatMoney(report.total_profit_from_sales)} -{" "}
          {formatMoney(report.actual_expense)} = {formatMoney(a.net_profit)} บาท
        </p>
      </div>

      <SectionTitle>การจัดสรรงบประมาณจากกำไรสุทธิ</SectionTitle>
      <ReportRow label="1. ทุนการศึกษา (30%)" value={a.scholarship} />
      <ReportRow label="2. สำรองฉุกเฉิน (30%)" value={a.emergency} />
      <ReportRow label="3. หมุนเวียนสนาม (30% - กลับเข้าทุน)" value={a.rotate} />
      <ReportRow label="4. ค่าตอบแทนเจ้าหน้าที่ (10%)" value={a.staff} />

      <div className="relative mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-right">
        <p className="text-[0.65rem] font-bold text-slate-600 sm:text-xs">
          ทุนคงเหลือเดือนถัดไป (ทุนเดิม + รายรับรวม - รายจ่ายรวม - ยอดจัดสรร)
        </p>
        <p className="text-sm font-bold sm:text-base">
          {formatMoney(report.prev_balance)} + {formatMoney(report.total_income)} -{" "}
          {formatMoney(report.total_expense)} - {formatMoney(a.total_out)} = {formatMoney(report.next_balance)} บาท
        </p>
      </div>

      <div className="relative mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="sm:w-3/5">
          <p className="font-bold">หมายเหตุ:</p>
          <p>• ยอดค้างรับ: {formatMoney(report.total_debt)} บาท</p>
          <p>• มูลค่าสินค้าคงเหลือ: {formatMoney(report.stock_value)} บาท</p>
          <p>• ยอดเงินสำรองฉุกเฉินสะสม: {formatMoney(report.reserve_balance)} บาท</p>
        </div>
        <div className="text-center sm:w-1/3">
          <p>.........................................</p>
          <p>( ผู้ตรวจสอบ )</p>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="relative mt-3 border-l-[3px] border-indigo-900 bg-slate-100 py-1 pl-2 text-[0.7rem] font-bold text-slate-700 sm:text-xs">
      {children}
    </p>
  );
}

function ReportRow({ label, value, bold }: { label: React.ReactNode; value: number; bold?: boolean }) {
  return (
    <div
      className={`relative flex justify-between gap-2 border-b border-dashed border-slate-200 py-1.5 ${bold ? "bg-slate-50 font-bold" : ""}`}
    >
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 font-bold">{formatMoney(value)} บาท</span>
    </div>
  );
}
