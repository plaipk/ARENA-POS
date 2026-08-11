"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type EntryType = "in" | "out";

/** Manual reserve-fund entry — for anything not tied to a period close, e.g.
 * an ad-hoc withdrawal ("จ่ายทุนกิจกรรมสอนบุตรกำลังพล" in the old sheet). */
export function ReserveFundEntryDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<EntryType>("out");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setType("out");
      setAmount("");
      setPeriod(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }));
      setNote("");
    }
  }

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!period.trim()) {
      toast.error("กรุณาระบุรายการ/ช่วงเวลา");
      return;
    }
    if (!(amt > 0)) {
      toast.error("จำนวนเงินต้องมากกว่า 0");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("add_reserve_fund_entry", {
      p_period: period.trim(),
      p_amount: type === "out" ? -amt : amt,
      p_note: note.trim() || null,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>+ บันทึกรายการเงินสำรองสนาม</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>ประเภท</Label>
            <Select value={type} onValueChange={(v) => setType(v as EntryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="out">จ่ายออกจากกองทุน</SelectItem>
                <SelectItem value="in">รับเข้ากองทุน</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>จำนวนเงิน</Label>
            <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>รายการ / ช่วงเวลา</Label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="เช่น 10/08/2569" />
          </div>
          <div>
            <Label>หมายเหตุ (ไม่บังคับ)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ทุนกิจกรรมสอนบุตรกำลังพล" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
