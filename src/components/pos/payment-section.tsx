"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types/database";

export type PayType = PaymentMethod | "credit";

export function PaymentSection({
  total,
  allowCredit,
  payType,
  onPayTypeChange,
  customerName,
  onCustomerNameChange,
  debtorNames,
}: {
  total: number;
  allowCredit: boolean;
  payType: PayType;
  onPayTypeChange: (v: PayType) => void;
  customerName: string;
  onCustomerNameChange: (v: string) => void;
  debtorNames: string[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between border-t border-[var(--line)] pt-2">
        <div>
          <Label className="mb-0">รวมทั้งบิล</Label>
          <div className="font-mono text-2xl font-bold text-indigo-700">{formatMoney(total)}</div>
        </div>
        <div className="w-[40%]">
          <Label>ชำระ</Label>
          <Select value={payType} onValueChange={(v) => onPayTypeChange(v as PayType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">เงินสด</SelectItem>
              <SelectItem value="transfer">โอน</SelectItem>
              {allowCredit && <SelectItem value="credit">เซ็น</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>

      {payType === "credit" && (
        <div className="mt-2">
          <Label>ชื่อผู้เซ็น (เลือกจากรายการหรือพิมพ์ใหม่)</Label>
          <Input
            list="debtorOptions"
            placeholder="ระบุชื่อลูกค้า..."
            value={customerName}
            onChange={(e) => onCustomerNameChange(e.target.value)}
          />
          <datalist id="debtorOptions">
            {debtorNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      )}
    </div>
  );
}
