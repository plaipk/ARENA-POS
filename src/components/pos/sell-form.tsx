"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Product, CartLine, TransactionMode } from "@/lib/types/database";

const MODE_PRICE_LABEL: Record<string, string> = {
  income: "ราคาขาย",
  expense: "ราคาจ่าย",
  stock_in: "ทุนรวม/หน่วย",
};

const MODE_BUTTON_CLASS: Record<string, string> = {
  income: "bg-emerald-500 hover:bg-emerald-600 text-white",
  expense: "bg-rose-500 hover:bg-rose-600 text-white",
  stock_in: "bg-amber-400 hover:bg-amber-500 text-black",
};

export function SellForm({
  mode,
  products,
  onAdd,
}: {
  mode: TransactionMode;
  products: Product[];
  onAdd: (line: CartLine) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const nameRef = useRef<HTMLInputElement>(null);

  function handleNameInput(value: string) {
    setName(value);
    if (mode !== "income") return;
    const match = products.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
    if (match) setPrice(String(match.price));
  }

  function reset() {
    setName("");
    setPrice("");
    setQty("1");
    nameRef.current?.focus();
  }

  function handleAdd() {
    const n = name.trim();
    const p = parseFloat(price) || 0;
    const q = parseInt(qty, 10) || 0;

    if (!n) {
      toast.error("กรุณาระบุชื่อรายการ");
      return;
    }
    if (!(q > 0)) {
      toast.error("จำนวนต้องมากกว่า 0");
      return;
    }

    onAdd({ name: n, price: p, qty: q, total: p * q });
    reset();
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Label htmlFor="itemInput">รายการ</Label>
          <Input
            id="itemInput"
            ref={nameRef}
            list="productOptions"
            value={name}
            onChange={(e) => handleNameInput(e.target.value)}
            autoComplete="off"
          />
          <datalist id="productOptions">
            {products.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>{MODE_PRICE_LABEL[mode] ?? "ราคา"}</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <Label>จำนวน</Label>
          <Input type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
      </div>
      <Button type="button" onClick={handleAdd} className={cn("mt-2 w-full", MODE_BUTTON_CLASS[mode])}>
        + เพิ่มรายการ
      </Button>
    </div>
  );
}
