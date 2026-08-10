"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useProducts, useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { StockTakeDialog } from "@/components/products/stock-take-dialog";
import { formatMoney } from "@/lib/utils";
import type { Product } from "@/lib/types/database";

export default function ProductsPage() {
  const { data: products = [], isLoading } = useProducts();
  const invalidate = useInvalidatePosData();
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [stockTakeOpen, setStockTakeOpen] = useState(false);

  async function handleDelete(p: Product) {
    if (!confirm(`ยืนยันลบสินค้า "${p.name}"?`)) return;
    setDeleting(p.id);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("delete_product", { p_id: p.id });
    setDeleting(null);
    if (error || !data?.ok) {
      toast.error((error?.message ?? data?.message) || "ลบไม่สำเร็จ");
      return;
    }
    toast.success(data.message ?? "ลบสำเร็จ!");
    invalidate();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 p-3 pb-8">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">📦 จัดการสินค้า</h1>
        <Button variant="outline" className="ml-auto" onClick={() => setStockTakeOpen(true)}>
          🔢 นับสต็อก
        </Button>
        <Button onClick={() => setEditing(null)}>+ เพิ่มสินค้า</Button>
      </div>

      <Card>
        {isLoading && <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !products.length && (
          <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีสินค้า กด &quot;+ เพิ่มสินค้า&quot; เพื่อเริ่ม</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-400">
                <th className="py-2 pr-2">ชื่อ</th>
                <th className="px-2 py-2">ประเภท</th>
                <th className="px-2 py-2 text-right">ต้นทุน</th>
                <th className="px-2 py-2 text-right">ราคาขาย</th>
                <th className="px-2 py-2 text-right">สต็อก</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-2 font-medium text-slate-800">{p.name}</td>
                  <td className="px-2 py-2">
                    <Badge variant={p.category === "field_rental" ? "info" : "default"}>
                      {p.category === "field_rental" ? "ค่าเช่าสนาม" : "สินค้าทั่วไป"}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-right">{formatMoney(p.cost)}</td>
                  <td className="px-2 py-2 text-right">{formatMoney(p.price)}</td>
                  <td className="px-2 py-2 text-right">{formatMoney(p.stock)}</td>
                  <td className="py-2 pl-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deleting === p.id}
                        onClick={() => handleDelete(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ProductFormDialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        product={editing ?? null}
        onSaved={invalidate}
      />
      <StockTakeDialog
        open={stockTakeOpen}
        onOpenChange={setStockTakeOpen}
        products={products}
        onSaved={invalidate}
      />
    </main>
  );
}
