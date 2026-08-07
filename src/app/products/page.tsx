"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useProducts, useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { formatMoney } from "@/lib/utils";
import type { Product } from "@/lib/types/database";

export default function ProductsPage() {
  const { data: products = [], isLoading } = useProducts();
  const invalidate = useInvalidatePosData();
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | null>(null);

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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 p-3 pb-8 lg:max-w-4xl">
      <div className="flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-bold text-[var(--ink)]">📦 จัดการสินค้า</h1>
        <Button className="ml-auto" onClick={() => setEditing(null)}>
          + เพิ่มสินค้า
        </Button>
      </div>

      <Card>
        {isLoading && <p className="py-6 text-center text-sm text-[var(--ink-soft)]">กำลังโหลด...</p>}
        {!isLoading && !products.length && (
          <p className="py-6 text-center text-sm text-[var(--ink-soft)]">ยังไม่มีสินค้า กด &quot;+ เพิ่มสินค้า&quot; เพื่อเริ่ม</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-xs text-[var(--ink-soft)]">
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
                <tr key={p.id} className="border-b border-[var(--line)]/60 last:border-0">
                  <td className="py-2 pr-2 font-medium text-[var(--ink)]">{p.name}</td>
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
    </main>
  );
}
