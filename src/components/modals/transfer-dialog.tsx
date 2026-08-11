"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";

type Direction = "cash_to_bank" | "bank_to_cash";

export function TransferDialog({
  open,
  onOpenChange,
  initialDirection = "cash_to_bank",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Pre-select a direction — e.g. long-pressing the "เงินสด" tile on the
   * balance header opens this already set to cash_to_bank. */
  initialDirection?: Direction;
}) {
  const invalidate = useInvalidatePosData();
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-seed direction (and clear any leftover amount) every time the dialog
  // opens. Runs during render, not onOpenChange/an effect — see
  // product-form-dialog.tsx for why: onOpenChange never fires when the
  // parent flips `open` externally, which is how this dialog always opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDirection(initialDirection);
      setAmount("");
    }
  }

  async function handleConfirm() {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return toast.error("กรุณาระบุยอดเงินให้ถูกต้อง!");

    const dirText = direction === "cash_to_bank" ? "เงินสด ไป เงินโอน" : "เงินโอน ไป เงินสด";
    if (!confirm(`ยืนยันการโยกเงิน:\n${dirText}\nจำนวน: ฿${formatMoney(amt)} ใช่หรือไม่?`)) return;

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("transfer_funds", {
      p_direction: direction,
      p_amount: amt,
    });
    setSaving(false);

    if (error || !data?.ok) {
      toast.error("โยกเงินไม่สำเร็จ: " + (error?.message ?? data?.message));
      return;
    }
    toast.success(data.message ?? "โยกเงินสำเร็จ!");
    setAmount("");
    invalidate();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-sky-600">🔄 โยกเงิน</DialogTitle>
        </DialogHeader>

        <div>
          <Label>รูปแบบการโยกเงิน</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash_to_bank">นำเงินสดเข้าบัญชี (เงินสด ➔ เงินโอน)</SelectItem>
              <SelectItem value="bank_to_cash">ถอนเงินมาใช้ (เงินโอน ➔ เงินสด)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>จำนวนเงิน</Label>
          <Input
            type="number"
            placeholder="ระบุยอดเงินที่ต้องการโยก"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <Button className="w-full bg-sky-500 hover:bg-sky-600" disabled={saving} onClick={handleConfirm}>
          บันทึกการโยกเงิน
        </Button>
      </DialogContent>
    </Dialog>
  );
}
