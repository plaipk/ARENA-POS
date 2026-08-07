"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PaymentMethod, Transaction, TransactionCategory } from "@/lib/types/database";

const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  product_sale: "ขายสินค้า",
  field_rental: "ค่าเช่าสนาม",
  general_expense: "จ่ายทั่วไป",
  stock_purchase: "รับของเข้า",
  debt_settlement: "รับชำระหนี้",
  transfer: "โยกเงิน",
  profit_allocation: "จัดสรรกำไร",
};

/** dd/mm/yyyy hh:mm formatted for a <input type="datetime-local"> value, in local time. */
function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TransactionEditDialog({
  open,
  onOpenChange,
  transaction,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transaction: Transaction | null;
  onSaved: () => void;
}) {
  const [occurredAt, setOccurredAt] = useState("");
  const [detail, setDetail] = useState("");
  const [income, setIncome] = useState("0");
  const [expense, setExpense] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [category, setCategory] = useState<TransactionCategory>("general_expense");
  const [saving, setSaving] = useState(false);

  // Re-seed the form from `transaction` the moment the dialog opens, rather
  // than in an effect (React flags setState-during-effect as a cascading-render smell).
  function handleOpenChange(next: boolean) {
    if (next && transaction) {
      setOccurredAt(toLocalInputValue(transaction.occurred_at));
      setDetail(transaction.detail);
      setIncome(String(transaction.income));
      setExpense(String(transaction.expense));
      setPaymentMethod(transaction.payment_method);
      setCategory(transaction.category);
    }
    onOpenChange(next);
  }

  async function handleSave() {
    if (!transaction) return;
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_transaction", {
      p_id: transaction.id,
      p_occurred_at: new Date(occurredAt).toISOString(),
      p_detail: detail,
      p_income: parseFloat(income) || 0,
      p_expense: parseFloat(expense) || 0,
      p_payment_method: paymentMethod,
      p_category: category,
    });
    setSaving(false);

    if (error || !data?.ok) {
      toast.error((error?.message ?? data?.message) || "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success(data.message ?? "บันทึกสำเร็จ!");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>แก้ไขรายการ</DialogTitle>
        </DialogHeader>

        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          ใช้แก้ข้อมูลที่พิมพ์ผิด (วันที่ / จำนวนเงิน / ประเภท) เท่านั้น — ถ้าขายผิดรายการ/ผิดจำนวนสินค้า
          ให้ใช้ &quot;ยกเลิกรายการ (Void)&quot; แล้วขายใหม่แทน เพราะการแก้ตรงนี้ไม่กระทบสต็อกสินค้า
        </p>

        <div className="space-y-3">
          <div>
            <Label>วันที่-เวลา</Label>
            <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
          <div>
            <Label>รายละเอียด</Label>
            <Input value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>รายรับ</Label>
              <Input type="number" value={income} onChange={(e) => setIncome(e.target.value)} />
            </div>
            <div>
              <Label>รายจ่าย</Label>
              <Input type="number" value={expense} onChange={(e) => setExpense(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>ประเภทการชำระ</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">เงินสด</SelectItem>
                  <SelectItem value="transfer">โอน</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>หมวดหมู่</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TransactionCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "กำลังบันทึก..." : "💾 บันทึกการแก้ไข"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
