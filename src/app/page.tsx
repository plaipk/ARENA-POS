"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useProducts, useDebtorNames, useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BalanceHeader } from "@/components/pos/balance-header";
import { ModeSwitch } from "@/components/pos/mode-switch";
import { SellForm } from "@/components/pos/sell-form";
import { CartList } from "@/components/pos/cart-list";
import { PaymentSection, type PayType } from "@/components/pos/payment-section";
import { DebtorsDialog } from "@/components/modals/debtors-dialog";
import { TransferDialog } from "@/components/modals/transfer-dialog";
import type { CartLine, TransactionMode } from "@/lib/types/database";

const PAY_TYPE_TO_DB: Record<PayType, string> = {
  cash: "เงินสด",
  transfer: "โอน",
  credit: "เซ็น",
};

export default function PosPage() {
  const [mode, setMode] = useState<TransactionMode>("income");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payType, setPayType] = useState<PayType>("transfer");
  const [customerName, setCustomerName] = useState("");
  const [saving, setSaving] = useState(false);

  const [dialog, setDialog] = useState<null | "debtors" | "transfer">(null);
  const [transferDirection, setTransferDirection] = useState<"cash_to_bank" | "bank_to_cash">("cash_to_bank");

  const { data: products = [] } = useProducts();
  const { data: debtorNames = [] } = useDebtorNames();
  const invalidate = useInvalidatePosData();

  const total = cart.reduce((s, i) => s + i.total, 0);

  function handleModeChange(next: "income" | "expense" | "stock_in") {
    setMode(next);
    setCart([]);
    if (next !== "income" && payType === "credit") setPayType("transfer");
  }

  async function handleSubmit() {
    if (!cart.length) {
      toast.error("เพิ่มรายการก่อน!");
      return;
    }
    if (payType === "credit" && !customerName.trim()) {
      toast.error("ใส่ชื่อคนเซ็นด้วย!");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("save_transaction", {
      p_cart: cart,
      p_payment_type: PAY_TYPE_TO_DB[payType],
      p_customer_name: payType === "credit" ? customerName.trim() : null,
      p_mode: mode,
    });
    setSaving(false);

    if (error) {
      toast.error("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    if (!data?.ok) {
      toast.error(data?.message ?? "บันทึกไม่สำเร็จ");
      return;
    }

    toast.success(data.message ?? "บันทึกข้อมูลสำเร็จ!");
    setCart([]);
    setCustomerName("");
    invalidate();
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 p-3 pb-8">
      <BalanceHeader
        onTransferRequest={(direction) => {
          setTransferDirection(direction);
          setDialog("transfer");
        }}
      />

      <Card>
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">ขายสินค้า</p>
        <ModeSwitch mode={mode} onChange={handleModeChange} />
        <SellForm mode={mode} products={products} onAdd={(line) => setCart((c) => [...c, line])} />
        <CartList cart={cart} onRemove={(i) => setCart((c) => c.filter((_, idx) => idx !== i))} />

        <PaymentSection
          total={total}
          allowCredit={mode === "income"}
          payType={payType}
          onPayTypeChange={setPayType}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          debtorNames={debtorNames}
        />

        <Button onClick={handleSubmit} disabled={saving} size="lg" className="mt-3 w-full">
          {saving ? "กำลังบันทึก..." : "💾 บันทึกข้อมูล"}
        </Button>
      </Card>

      <Card>
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-400">เมนูอื่นๆ</p>
        <div className="grid grid-cols-1 gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialog("debtors")}>
            👥 ดูยอดหนี้ค้างชำระ
          </Button>
        </div>
      </Card>

      <DebtorsDialog open={dialog === "debtors"} onOpenChange={(o) => setDialog(o ? "debtors" : null)} />
      <TransferDialog
        open={dialog === "transfer"}
        onOpenChange={(o) => setDialog(o ? "transfer" : null)}
        initialDirection={transferDirection}
      />
    </main>
  );
}
