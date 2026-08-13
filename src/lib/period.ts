/** Thai month names, 1-indexed (index 0 unused) — matches MONTH_NAMES_TH in the original Code.gs. */
export const MONTH_NAMES_TH = [
  "",
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

/**
 * Accounting period bounds: 26th of the previous month through 25th of the given month.
 * Mirrors getPeriodInfo_() in the original Code.gs — the period rule is fixed business logic,
 * not something the UI should change.
 */
export function getPeriodInfo(month: number, year: number) {
  const startDate = new Date(year, month - 2, 26, 0, 0, 0);
  const endDate = new Date(year, month - 1, 25, 23, 59, 59);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
  return { startDate, endDate, periodStr: `${fmt(startDate)} - ${fmt(endDate)}` };
}

/** "Now" in Thailand's wall-clock time, regardless of the browser's own
 * timezone — mirrors the `at time zone 'Asia/Bangkok'` the backend uses for
 * period boundaries (get_report_by_month), so this always agrees with the
 * server's idea of what day it is. */
export function bangkokNow(): Date {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

/** True once the accounting period ending on the 25th of (month, year) has
 * actually finished — i.e. it's the 26th (Bangkok time) or later. ปิดงวด
 * should only be allowed after this: closing early would lock in numbers
 * for a period that isn't over yet. */
export function isPeriodOver(month: number, year: number): boolean {
  const now = bangkokNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const d = now.getUTCDate();
  if (y !== year) return y > year;
  if (m !== month) return m > month;
  return d > 25;
}
