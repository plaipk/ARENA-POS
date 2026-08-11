"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useBalanceSummary } from "@/lib/hooks/use-pos-data";
import { formatMoney } from "@/lib/utils";

const HOLD_MS = 500;

/** Press-and-hold a balance tile to open the transfer dialog with that pile
 * as the source (hold "เงินสด" -> เงินสด➔เงินโอน preset, and vice-versa) —
 * a quicker, more direct alternative to opening the dialog and picking a
 * direction from a dropdown. A plain tap does nothing (this is money; a
 * deliberate hold avoids triggering a transfer by accident). */
function useHoldToPress(onHold: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pressing, setPressing] = useState(false);

  function start() {
    setPressing(true);
    timer.current = setTimeout(() => {
      setPressing(false);
      timer.current = null;
      if (navigator.vibrate) navigator.vibrate(15);
      onHold();
    }, HOLD_MS);
  }

  function cancel() {
    setPressing(false);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  return {
    pressing,
    handlers: {
      onPointerDown: start,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}

export function BalanceHeader({
  onTransferRequest,
}: {
  /** Called with the source side the user held down on. */
  onTransferRequest?: (direction: "cash_to_bank" | "bank_to_cash") => void;
}) {
  const { data, isFetching, refetch } = useBalanceSummary();
  const cashHold = useHoldToPress(() => onTransferRequest?.("cash_to_bank"));
  const transferHold = useHoldToPress(() => onTransferRequest?.("bank_to_cash"));

  return (
    <div className="rounded-3xl bg-gradient-to-br from-[#1a1c2c] to-[#4a4e69] p-4 text-white">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="m-0 text-sm font-bold">⚽ ARENA POS PRO</h1>
        <button
          onClick={() => refetch()}
          className="rounded-full bg-white/15 px-2 py-1 text-[0.65rem] font-semibold hover:bg-white/25"
        >
          <RefreshCw className={`inline h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> รีเฟรช
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div
          className={`select-none rounded-xl bg-white/15 p-2 text-center backdrop-blur transition-transform ${cashHold.pressing ? "scale-95 bg-white/30 ring-2 ring-white/60" : ""}`}
          {...cashHold.handlers}
        >
          <small className="block text-[0.6rem] opacity-75">เงินสด</small>
          <span className="text-lg font-bold">{data ? formatMoney(data.cash) : "···"}</span>
        </div>
        <div
          className={`select-none rounded-xl bg-white/15 p-2 text-center backdrop-blur transition-transform ${transferHold.pressing ? "scale-95 bg-white/30 ring-2 ring-white/60" : ""}`}
          {...transferHold.handlers}
        >
          <small className="block text-[0.6rem] opacity-75">เงินโอน</small>
          <span className="text-lg font-bold">{data ? formatMoney(data.transfer) : "···"}</span>
        </div>
      </div>
      {onTransferRequest && (
        <p className="mt-1.5 text-center text-[0.6rem] text-white/50">กดค้างที่ก้อนเงิน เพื่อโยกเงิน</p>
      )}
    </div>
  );
}
