"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useInvalidatePosData } from "@/lib/hooks/use-pos-data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";

interface DebtorSummaryRow {
  name: string;
  total: number;
}

export function DebtorsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidatePosData();
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [settling, setSettling] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["debtor-summary"],
    enabled: open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("v_debtor_summary").select("*");
      if (error) throw error;
      return data as DebtorSummaryRow[];
    },
  });

  async function settle(name: string, total: number, type: "cash" | "transfer") {
    const raw = payAmounts[name] ?? String(total);
    const amt = parseFloat(raw) || 0;
    if (amt <= 0) return toast.error("กรุณาระบุยอดเงินที่ถูกต้อง!");
    if (amt > total + 0.005) return toast.error(`ยอดชำระเกินยอดค้าง (${formatMoney(total)} บาท)`);
    if (!confirm(`ยืนยันรับชำระจาก ${name} จำนวน ${formatMoney(amt)} บาท (${type === "cash" ? "เงินสด" : "โอน"})?`))
      return;

    setSettling(name);
    const supabase = createClient();
    const { data: res, error } = await supabase.rpc("settle_debt", {
      p_customer_name: name,
      p_pay_amount: amt,
      p_payment_type: type,
    });
    setSettling(null);

    if (error || !res?.ok) {
      toast.error("รับชำระไม่สำเร็จ: " + (error?.message ?? res?.message));
      refetch();
      return;
    }
    toast.success(res.message ?? "บันทึกชำระเงินเรียบร้อย!");
    invalidate();
    refetch();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>สรุปยอดลูกหนี้</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="py-6 text-center text-sm text-slate-400">กำลังโหลด...</p>}
        {!isLoading && !data?.length && (
          <p className="py-6 text-center text-sm text-slate-400">ไม่มีหนี้ค้าง</p>
        )}

        <div className="space-y-2">
          {data?.map((d) => (
            <div key={d.name} className="rounded-2xl bg-slate-50 p-3">
              <div className="flex justify-between">
                <b className="text-sm">{d.name}</b>
                <span className="text-sm font-bold text-rose-600">ยอดค้าง: {formatMoney(d.total)}</span>
              </div>
              <div className="mt-2 flex gap-1">
                <span className="flex h-8 items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-100 px-2 text-xs text-slate-500">
                  ฿
                </span>
                <Input
                  type="number"
                  className="h-8 rounded-none text-sm"
                  defaultValue={d.total}
                  max={d.total}
                  onChange={(e) => setPayAmounts((p) => ({ ...p, [d.name]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="success"
                  disabled={settling === d.name}
                  onClick={() => settle(d.name, d.total, "cash")}
                >
                  สด
                </Button>
                <Button
                  size="sm"
                  className="bg-sky-500 hover:bg-sky-600"
                  disabled={settling === d.name}
                  onClick={() => settle(d.name, d.total, "transfer")}
                >
                  โอน
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
