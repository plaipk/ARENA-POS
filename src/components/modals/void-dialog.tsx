"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";

interface SearchResultRow {
  id: string;
  source: "main" | "debt";
  detail: string;
  amount: number;
  type: string;
  partial: string | null;
}

export function VoidDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidatePosData();
  const [date, setDate] = useState("");
  const [results, setResults] = useState<SearchResultRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);

  async function search() {
    if (!date) return toast.error("กรุณาเลือกวันที่!");
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("search_transactions_by_date", { p_date: date });
    setLoading(false);
    if (error) {
      toast.error("ค้นหาไม่สำเร็จ: " + error.message);
      return;
    }
    setResults((data as SearchResultRow[]) ?? []);
  }

  async function handleVoid(row: SearchResultRow) {
    let note = "*ระบบจะคืนสต็อกและจัดการยอดหนี้ให้อัตโนมัติ*";
    if (row.source === "debt") {
      note = row.partial
        ? `⚠️ รายการนี้ลูกค้าจ่ายมาบางส่วนแล้ว (${row.partial})\nระบบจะ *ไม่คืนสต็อก* เพราะของออกไปตั้งแต่ตอนเซ็น\nยอดที่เหลือจะถูกตัดทิ้งเป็นหนี้สูญ`
        : "รายการนี้ยังไม่มีการชำระ ระบบจะคืนสต็อกให้อัตโนมัติ";
    }
    if (!confirm(`ยืนยันจะลบรายการ: "${row.detail}" ใช่หรือไม่?\n\n${note}`)) return;
    const reason = prompt("ระบุเหตุผลการยกเลิก (ไม่บังคับ):") ?? "";

    setVoiding(row.id);
    const supabase = createClient();
    const { data, error } =
      row.source === "debt"
        ? await supabase.rpc("void_debt", { p_debt_id: row.id, p_reason: reason || null })
        : await supabase.rpc("void_transaction", { p_transaction_id: row.id, p_reason: reason || null });
    setVoiding(null);

    if (error || !data?.ok) {
      toast.error("ลบไม่สำเร็จ: " + (error?.message ?? data?.message));
      search();
      return;
    }
    toast.success(data.message ?? "ลบรายการสำเร็จ!");
    invalidate();
    search();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🔍 ยกเลิกรายการ (Void)</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button onClick={search} disabled={loading}>
            ค้นหา
          </Button>
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {results === null && (
            <p className="py-6 text-center text-sm text-[var(--ink-soft)]">ระบุวันที่แล้วกดค้นหา เพื่อเลือกรายการที่จะลบ</p>
          )}
          {results?.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--ink-soft)]">ไม่พบรายการในวันที่เลือก</p>
          )}
          {results?.map((r) => (
            <div
              key={r.id}
              className={`sk-well flex items-center justify-between rounded-xl p-2 ${r.source === "debt" ? "!bg-gradient-to-b !from-amber-100 !to-amber-200" : ""}`}
            >
              <div className="text-xs leading-tight">
                <b className="text-[var(--ink)]">{r.detail}</b>
                <br />
                <span className="font-bold text-indigo-600">฿{formatMoney(r.amount)}</span>{" "}
                <Badge variant={r.source === "debt" ? "danger" : "default"}>{r.type}</Badge>{" "}
                {r.partial && <Badge variant="dark">{r.partial}</Badge>}
              </div>
              <Button
                size="sm"
                variant="danger"
                className="rounded-full"
                disabled={voiding === r.id}
                onClick={() => handleVoid(r)}
              >
                ลบ
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
