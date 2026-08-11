"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/lib/types/database";

/** Physical stock count: staff types what's actually on the shelf per
 * product. This is a count/report only — record_stock_take() never touches
 * `products.stock`; every item (matched or not) is logged for the history
 * page to show, and correcting the system's number (if needed) is a
 * separate, deliberate step via "แก้ไข" on the product itself. */
export function StockTakeDialog({
  open,
  onOpenChange,
  products,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: Product[];
  onSaved: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Re-seed every field from the current stock the moment the dialog opens.
  // Runs during render — onOpenChange never fires when the parent flips
  // `open` externally (no DialogTrigger involved), only for Radix-initiated
  // close transitions.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCounts(Object.fromEntries(products.map((p) => [p.id, String(p.stock)])));
    }
  }

  async function handleSave() {
    const items = products
      .map((p) => ({ product_id: p.id, counted_stock: parseFloat(counts[p.id] ?? "") }))
      .filter((i) => !Number.isNaN(i.counted_stock) && i.counted_stock >= 0);

    if (!items.length) {
      toast.error("ไม่มีรายการที่กรอกจำนวนไว้");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("record_stock_take", { p_items: items });
    setSaving(false);

    if (error || !data?.ok) {
      toast.error((error?.message ?? data?.message) || "บันทึกไม่สำเร็จ");
      return;
    }
    toast.success(data.message ?? "นับสต็อกสำเร็จ!");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>🔢 นับสต็อกจริง</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500">
          กรอกจำนวนที่นับได้จริงบนชั้นของแต่ละสินค้า ระบบจะ<b>บันทึกไว้เทียบดูเฉยๆ ไม่ปรับยอดสต็อกในระบบให้</b>
          — ดูผลเกิน/ขาดทั้งหมดได้ที่ &quot;ประวัตินับสต็อก&quot; ทีหลัง ปล่อยว่างไว้ถ้ายังไม่ได้นับรายการนั้น
        </p>

        <div className="max-h-96 space-y-1.5 overflow-y-auto">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800">{p.name}</div>
                <div className="flex items-center gap-1 text-[0.65rem] text-slate-400">
                  <Badge variant={p.category === "field_rental" ? "info" : "default"}>
                    {p.category === "field_rental" ? "ค่าเช่าสนาม" : "สินค้าทั่วไป"}
                  </Badge>
                  ในระบบตอนนี้: {p.stock}
                </div>
              </div>
              <Input
                type="number"
                inputMode="decimal"
                className="w-24 text-right"
                value={counts[p.id] ?? ""}
                onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "กำลังบันทึก..." : "💾 บันทึกผลนับสต็อก"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
