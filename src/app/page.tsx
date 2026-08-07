"use client";

import { useState } from "react";
import Link from "next/link";
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
import { VoidDialog } from "@/components/modals/void-dialog";
import { ReportDialog } from "@/components/modals/report-dialog";
import { ArchiveDialog } from "@/components/modals/archive-dialog";
import type { CartLine, TransactionMode } from "@/lib/types/database";

const PAY_TYPE_TO_DB: Record<PayType, string> = {
  cash: "เงินสด",
  transfer: "โอน",
  credit: "เซ็น",
};

export default function PosPage() {
  const [mode, setMode] = useState<TransactionMode>("income");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payType, setPayType] = useState<PayType>("cash");
  const [customerName, setCustomerName] = useState("");
  const [saving, setSaving] = useState(false);

  const [dialog, setDialog] = useState<
    null | "debtors" | "transfer" | "void" | "report-view" | "report-close" | "archive"
  >(null);

  const { data: products = [] } = useProducts();
  const { data: debtorNames = [] } = useDebtorNames();
  const invalidate = useInvalidatePosData();

  const total = cart.reduce((s, i) => s + i.total, 0);

  function handleModeChange(next: "income" | "expense" | "stock_in") {
    setMode(next);
    setCart([]);
    if (next !== "income" && payType === "credit") setPayType("cash");
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 p-3 pb-8 lg:max-w-6xl">
      <BalanceHeader />

      <div className="flex gap-2">
        <Link href="/statement" className="flex-1">
          <Button variant="outline" size="sm" className="w-full">
            📑 สเตทเมนต์
          </Button>
        </Link>
        <Link href="/products" className="flex-1">
          <Button variant="outline" size="sm" className="w-full">
            📦 จัดการสินค้า
          </Button>
        </Link>
      </div>

      {/*
        Mobile: plain stacked flow in DOM order (entry -> cart/pay -> actions -> reports).
        Desktop (lg+): a real 2-column register layout — explicit grid placement means
        the visual order doesn't have to match the DOM order above, so mobile keeps its
        natural top-to-bottom flow while desktop gets entry+actions on the left and a
        cart/checkout column pinned on the right.
      */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-4">
        <Card className="lg:col-start-1 lg:row-start-1">
          <ModeSwitch mode={mode} onChange={handleModeChange} />
          <SellForm mode={mode} products={products} onAdd={(line) => setCart((c) => [...c, line])} />
        </Card>

        <Card className="lg:sticky lg:top-3 lg:col-start-2 lg:row-start-1 lg:row-span-3">
          <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            ตะกร้า
          </p>
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

        <Card className="lg:col-start-1 lg:row-start-2">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            <Button variant="outline" size="sm" onClick={() => setDialog("transfer")}>
              🔄 โยกเงิน (เงินสด ↔ เงินโอน)
            </Button>
            <Button variant="outlineDanger" size="sm" onClick={() => setDialog("void")}>
              🔍 ค้นหาและยกเลิกรายการ (Void)
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDialog("debtors")}>
              👥 ดูยอดหนี้ค้างชำระ
            </Button>
          </div>
        </Card>

        <Card className="lg:col-start-1 lg:row-start-3">
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
            รายงานประจำเดือน (26-25)
          </p>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <Button
              variant="ghost"
              className="border border-black/30 bg-gradient-to-b from-[var(--navy-2)] to-[var(--navy-1)] text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_-2px_4px_rgba(0,0,0,0.3)_inset,0_3px_6px_-1px_rgba(0,0,0,0.4)] hover:brightness-110 active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.5)]"
              onClick={() => setDialog("report-view")}
            >
              📄 ดูรายงาน / ดาวน์โหลด PDF
            </Button>
            <Button variant="outline" onClick={() => setDialog("archive")}>
              🗂️ รายงานย้อนหลัง (ทั้งปี)
            </Button>
          </div>

          <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-rose-300/50 bg-rose-50/50 p-3 lg:flex-row lg:justify-between">
            <p className="text-center text-[0.65rem] font-semibold text-rose-600 lg:text-left">
              โซนปิดงวด — ทำครั้งเดียวต่อเดือน
            </p>
            <Button variant="danger" onClick={() => setDialog("report-close")} className="w-full lg:w-auto">
              🔒 ปิดงวด + จัดสรรกำไร
            </Button>
          </div>
        </Card>
      </div>

      <DebtorsDialog open={dialog === "debtors"} onOpenChange={(o) => setDialog(o ? "debtors" : null)} />
      <TransferDialog open={dialog === "transfer"} onOpenChange={(o) => setDialog(o ? "transfer" : null)} />
      <VoidDialog open={dialog === "void"} onOpenChange={(o) => setDialog(o ? "void" : null)} />
      <ReportDialog
        mode="view"
        open={dialog === "report-view"}
        onOpenChange={(o) => setDialog(o ? "report-view" : null)}
      />
      <ReportDialog
        mode="close"
        open={dialog === "report-close"}
        onOpenChange={(o) => setDialog(o ? "report-close" : null)}
      />
      <ArchiveDialog open={dialog === "archive"} onOpenChange={(o) => setDialog(o ? "archive" : null)} />
    </main>
  );
}
