import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { MONTH_NAMES_TH } from "@/lib/period";
import type { MonthlyReport } from "@/lib/types/database";

const money = (n: number) => (Number(n) || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Sarabun", fontSize: 10, color: "#333" },
  header: { textAlign: "center", marginBottom: 10 },
  h2: { fontSize: 15, color: "#1a237e", fontWeight: 700 },
  h3: { fontSize: 12, marginTop: 2 },
  small: { fontSize: 9, color: "#666" },
  sectionTitle: {
    fontWeight: 700,
    marginTop: 12,
    paddingLeft: 8,
    paddingVertical: 4,
    backgroundColor: "#f0f2f5",
    borderLeft: "3px solid #1a237e",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottom: "1px dashed #eee",
  },
  rowBold: { fontWeight: 700, backgroundColor: "#fafafa" },
  profitBox: {
    backgroundColor: "#e8f5e9",
    padding: 10,
    borderRadius: 6,
    marginTop: 12,
    border: "1px solid #c8e6c9",
  },
  balanceBox: {
    backgroundColor: "#fff9c4",
    padding: 10,
    borderRadius: 6,
    marginTop: 8,
    border: "1px solid #fbc02d",
  },
  resultText: { fontSize: 13, fontWeight: 700, textAlign: "right" },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  signature: { width: "35%", textAlign: "center", marginTop: 20 },
});

export function MonthlyReportDocument({
  report,
  month,
  year,
}: {
  report: MonthlyReport;
  month: number;
  year: number;
}) {
  const a = report.alloc;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.h2}>สรุปรายรับ-รายจ่าย สนามฟุตบอล</Text>
          <Text style={styles.h3}>
            ประจำเดือน {MONTH_NAMES_TH[month]} {year}
          </Text>
          <Text style={styles.small}>(รอบวันที่ {report.period})</Text>
        </View>

        <Text style={{ textAlign: "right", marginBottom: 4 }}>
          <Text style={{ fontWeight: 700 }}>เงินทุนตั้งต้น: </Text>
          {money(report.prev_balance)} บาท
        </Text>

        <Text style={styles.sectionTitle}>รายละเอียดรายรับ</Text>
        {report.product_sales_total > 0 && (
          <View style={styles.row}>
            <Text>
              - รายได้ขายสินค้า{" "}
              <Text style={{ fontSize: 8, color: "#2e7d32" }}>
                (กำไรส่วนนี้: {money(report.total_profit_from_sales)} บาท)
              </Text>
            </Text>
            <Text>{money(report.product_sales_total)} บาท</Text>
          </View>
        )}
        {report.other_income_items.map((item, i) => (
          <View style={styles.row} key={i}>
            <Text>- {item.name}</Text>
            <Text>{money(item.amount)} บาท</Text>
          </View>
        ))}
        <View style={[styles.row, styles.rowBold]}>
          <Text>รายรับรวมทั้งสิ้น</Text>
          <Text>{money(report.total_income)} บาท</Text>
        </View>

        <Text style={styles.sectionTitle}>รายละเอียดรายจ่าย</Text>
        {report.stock_expense > 0 && (
          <View style={styles.row}>
            <Text>- ซื้อของ / เติมสินค้า (ยอดรวม)</Text>
            <Text>{money(report.stock_expense)} บาท</Text>
          </View>
        )}
        {report.general_expenses.map((item, i) => (
          <View style={styles.row} key={i}>
            <Text>- {item.name}</Text>
            <Text>{money(item.amount)} บาท</Text>
          </View>
        ))}
        <View style={[styles.row, styles.rowBold]}>
          <Text>รายจ่ายรวมทั้งสิ้น</Text>
          <Text>{money(report.total_expense)} บาท</Text>
        </View>

        <View style={styles.profitBox}>
          <Text style={{ fontSize: 8, color: "#666", marginBottom: 3 }}>
            กำไรสุทธิรอบนี้ (ค่าเช่าสนาม + กำไรขายของ - รายจ่ายเบ็ดเตล็ด)
          </Text>
          <Text style={{ fontSize: 12, color: "#2e7d32", fontWeight: 700 }}>
            {money(report.rent_income_total)} + {money(report.total_profit_from_sales)} -{" "}
            {money(report.actual_expense)} = {money(a.net_profit)} บาท
          </Text>
        </View>

        <Text style={styles.sectionTitle}>การจัดสรรงบประมาณจากกำไรสุทธิ</Text>
        <View style={styles.row}>
          <Text wrap={false}>1. ทุนการศึกษา (30%)</Text>
          <Text wrap={false}>{money(a.scholarship)} บาท</Text>
        </View>
        <View style={styles.row}>
          <Text wrap={false}>2. สำรองฉุกเฉิน (30%)</Text>
          <Text wrap={false}>{money(a.emergency)} บาท</Text>
        </View>
        <View style={styles.row}>
          <Text wrap={false}>3. หมุนเวียนสนาม (30% - กลับเข้าทุน)</Text>
          <Text wrap={false}>{money(a.rotate)} บาท</Text>
        </View>
        <View style={styles.row}>
          <Text wrap={false}>4. ค่าตอบแทนเจ้าหน้าที่ (10%)</Text>
          <Text wrap={false}>{money(a.staff)} บาท</Text>
        </View>

        <View style={styles.balanceBox}>
          <Text style={[styles.resultText, { fontSize: 9 }]}>
            ทุนคงเหลือเดือนถัดไป (ทุนเดิม + รายรับรวม - รายจ่ายรวม - ยอดจัดสรร)
          </Text>
          <Text style={styles.resultText}>
            {money(report.prev_balance)} + {money(report.total_income)} - {money(report.total_expense)} -{" "}
            {money(a.total_out)} = {money(report.next_balance)} บาท
          </Text>
        </View>

        <View style={styles.footerRow}>
          <View style={{ width: "60%" }}>
            <Text style={{ fontWeight: 700 }}>หมายเหตุ:</Text>
            <Text>• ยอดค้างรับ: {money(report.total_debt)} บาท</Text>
            <Text>• มูลค่าสินค้าคงเหลือ: {money(report.stock_value)} บาท</Text>
            <Text>• ยอดเงินสำรองฉุกเฉินสะสม: {money(report.reserve_balance)} บาท</Text>
          </View>
          <View style={styles.signature}>
            <Text>.........................................</Text>
            <Text>( ผู้ตรวจสอบ )</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
