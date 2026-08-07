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
