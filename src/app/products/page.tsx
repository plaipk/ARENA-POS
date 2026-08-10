"use client";

import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useProducts, useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { StockTakeDialog } from "@/components/products/stock-take-dialog";
import { StockTakeHistoryDialog } from "@/components/products/stock-take-history-dialog";
import { formatMoney } from "@/lib/utils";
import type { Product } from "@/lib/types/database";

export default function ProductsPage() {
  const { data: allProducts = [], isLoading } = useProducts();
  const invalidate = useInvalidatePosData();
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [stockTakeOpen, setStockTakeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState("");

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allProducts.filter((p) => p.name.toLowerCase().includes(q)) : allProducts;
  }, [allProducts, search]);

  async function handleDelete(p: Product) {
    if (!confirm(`ยืนยันลบสินค้า "${p.name}"?`)) return;
    setSheetProduct(null);
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
      <h1 className="text-lg font-bold text-slate-800">📦 จัดการสินค้า</h1>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <Button variant="outline" onClick={() => setHistoryOpen(true)}>
          🕓 ประวัตินับสต็อก
        </Button>
        <Button variant="outline" onClick={() => setStockTakeOpen(true)}>
          🔢 นับสต็อก
        </Button>
        <Button className="col-span-2 sm:col-span-1" onClick={() => setEditing(null)}>
          + เพิ่มสินค้า
        </Button>
      </div>

      <Card>
        <Label>ค้นหาสินค้า</Label>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="พิมพ์ชื่อสินค้า..." />
      </Card>

      <Card className="p-0">
        {isLoading && <p className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !products.length && (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            {allProducts.length ? "ไม่พบสินค้าที่ค้นหา" : 'ยังไม่มีสินค้า กด "+ เพิ่มสินค้า" เพื่อเริ่ม'}
          </p>
        )}

        {/* Desktop: table + inline row actions */}
        {!isLoading && products.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-400">
                  <th className="py-2 pl-4 pr-2">ชื่อ</th>
                  <th className="px-2 py-2">ประเภท</th>
                  <th className="px-2 py-2 text-right">ต้นทุน</th>
                  <th className="px-2 py-2 text-right">ราคาขาย</th>
                  <th className="px-2 py-2 text-right">สต็อก</th>
                  <th className="py-2 pl-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pl-4 pr-2 font-medium text-slate-800">{p.name}</td>
                    <td className="px-2 py-2">
                      <Badge variant={p.category === "field_rental" ? "info" : "default"}>
                        {p.category === "field_rental" ? "ค่าเช่าสนาม" : "สินค้าทั่วไป"}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-right">{formatMoney(p.cost)}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(p.price)}</td>
                    <td className="px-2 py-2 text-right">{formatMoney(p.stock)}</td>
                    <td className="py-2 pl-2 pr-4">
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
        )}

        {/* Mobile: seamless card list, tap a row to open the action sheet */}
        {!isLoading && products.length > 0 && (
          <div className="m-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 md:hidden">
            {products.map((p) => (
              <div
                key={p.id}
                className="cursor-pointer bg-white p-3 active:bg-slate-50"
                onClick={() => setSheetProduct(p)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{p.name}</span>
                  <Badge variant={p.category === "field_rental" ? "info" : "default"} className="shrink-0">
                    {p.category === "field_rental" ? "ค่าเช่าสนาม" : "สินค้าทั่วไป"}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    ต้นทุน {formatMoney(p.cost)} · ขาย {formatMoney(p.price)}
                  </span>
                  <span className="shrink-0">สต็อก {formatMoney(p.stock)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <BottomSheet open={!!sheetProduct} onOpenChange={(o) => !o && setSheetProduct(null)}>
        <BottomSheetContent>
          {sheetProduct && (
            <>
              <BottomSheetHeader>
                <BottomSheetTitle>{sheetProduct.name}</BottomSheetTitle>
              </BottomSheetHeader>
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(sheetProduct);
                    setSheetProduct(null);
                  }}
                >
                  ✏️ แก้ไข
                </Button>
                <Button
                  variant="danger"
                  disabled={deleting === sheetProduct.id}
                  onClick={() => handleDelete(sheetProduct)}
                >
                  🗑️ ลบสินค้า
                </Button>
                <Button variant="ghost" onClick={() => setSheetProduct(null)}>
                  ปิด
                </Button>
              </div>
            </>
          )}
        </BottomSheetContent>
      </BottomSheet>

      <ProductFormDialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        product={editing ?? null}
        onSaved={invalidate}
      />
      <StockTakeDialog
        open={stockTakeOpen}
        onOpenChange={setStockTakeOpen}
        products={allProducts}
        onSaved={invalidate}
      />
      <StockTakeHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </main>
  );
}
