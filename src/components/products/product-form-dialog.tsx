"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Product, ProductCategory } from "@/lib/types/database";

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** null = creating a new product; otherwise editing this one. */
  product: Product | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("merchandise");
  const [cost, setCost] = useState("0");
  const [price, setPrice] = useState("0");
  const [stock, setStock] = useState("0");
  const [saving, setSaving] = useState(false);

  // Re-seed the form from `product` the moment the dialog opens. This has to
  // run during render (React's documented pattern for "adjust state when a
  // prop changes"), not in an onOpenChange handler or an effect: Radix only
  // calls onOpenChange for transitions IT initiates (Escape, overlay click,
  // close button) — when the parent flips `open` externally (setEditing(p),
  // no DialogTrigger involved at all here), onOpenChange never fires, so
  // seeding there was silently dead code and the form opened blank/stale.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(product?.name ?? "");
      setCategory(product?.category ?? "merchandise");
      setCost(String(product?.cost ?? 0));
      setPrice(String(product?.price ?? 0));
      setStock(String(product?.stock ?? 0));
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("กรุณาระบุชื่อสินค้า");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("upsert_product", {
      p_id: product?.id ?? null,
      p_name: name.trim(),
      p_category: category,
      p_cost: parseFloat(cost) || 0,
      p_price: parseFloat(price) || 0,
      p_stock: parseFloat(stock) || 0,
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
          <DialogTitle>{product ? "แก้ไขสินค้า" : "+ เพิ่มสินค้าใหม่"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>ชื่อสินค้า</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>ประเภท</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merchandise">สินค้าทั่วไป</SelectItem>
                <SelectItem value="field_rental">ค่าเช่าสนาม (นับเป็นรายได้ค่าสนาม ไม่ใช่ขายของ)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>ต้นทุน</Label>
              <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div>
              <Label>ราคาขาย</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label>สต็อก</Label>
              <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
