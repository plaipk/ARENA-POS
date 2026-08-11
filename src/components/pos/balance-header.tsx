"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useBalanceSummary } from "@/lib/hooks/use-pos-data";
import { formatMoney } from "@/lib/utils";

const HOLD_MS = 250; // press-and-hold before a drag "picks up" the tile
const MOVE_CANCEL_PX = 10; // movement past this during the hold cancels it (probably a scroll, not a drag)

type Side = "cash" | "transfer";

/** Press-and-hold a balance tile, then drag it onto the other one to open
 * the transfer dialog preset with that direction (hold "เงินสด", drag onto
 * "เงินโอน" -> เงินสด➔เงินโอน). The dragged tile lifts and follows the
 * pointer/finger; the target tile glows when it's about to be dropped on.
 * The amount still has to be typed in the dialog afterward either way —
 * this only decides direction, since dragging can't set an exact amount. */
export function BalanceHeader({
  onTransferRequest,
}: {
  onTransferRequest?: (direction: "cash_to_bank" | "bank_to_cash") => void;
}) {
  const { data, isFetching, refetch } = useBalanceSummary();
  const cashRef = useRef<HTMLDivElement>(null);
  const transferRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const [drag, setDrag] = useState<{ from: Side; x: number; y: number } | null>(null);
  const [overTarget, setOverTarget] = useState(false);

  function targetElFor(from: Side) {
    return (from === "cash" ? transferRef : cashRef).current;
  }

  function reset() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    startPos.current = null;
    setDrag(null);
    setOverTarget(false);
  }

  function handlePointerDown(from: Side, e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    startPos.current = { x: e.clientX, y: e.clientY };
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      if (navigator.vibrate) navigator.vibrate(10);
      setDrag({ from, x: 0, y: 0 });
    }, HOLD_MS);
  }

  function handlePointerMove(from: Side, e: React.PointerEvent) {
    if (!startPos.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;

    if (!drag) {
      // Still waiting out the hold — bail if this looks like a scroll instead.
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX && holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      return;
    }

    e.preventDefault();
    setDrag({ from, x: dx, y: dy });

    const target = targetElFor(from);
    if (target) {
      const rect = target.getBoundingClientRect();
      setOverTarget(
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom,
      );
    }
  }

  function handlePointerUp(from: Side) {
    if (drag && drag.from === from && overTarget) {
      if (navigator.vibrate) navigator.vibrate(20);
      onTransferRequest?.(from === "cash" ? "cash_to_bank" : "bank_to_cash");
    }
    reset();
  }

  function tileStyle(side: Side): React.CSSProperties {
    if (drag?.from === side) {
      return { touchAction: "none", position: "relative", transform: `translate(${drag.x}px, ${drag.y}px) scale(1.08)` };
    }
    return { touchAction: "none" };
  }

  function tileClass(side: Side) {
    const isDragSource = drag?.from === side;
    const isDropTarget = drag !== null && drag.from !== side && overTarget;
    return [
      "select-none rounded-xl bg-white/15 p-2 text-center backdrop-blur",
      isDragSource ? "z-20 shadow-2xl" : "transition-transform",
      isDropTarget ? "scale-105 bg-white/30 ring-2 ring-emerald-300" : "",
    ].join(" ");
  }

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
          ref={cashRef}
          className={tileClass("cash")}
          style={tileStyle("cash")}
          onPointerDown={(e) => handlePointerDown("cash", e)}
          onPointerMove={(e) => handlePointerMove("cash", e)}
          onPointerUp={() => handlePointerUp("cash")}
          onPointerCancel={reset}
          onContextMenu={(e) => e.preventDefault()}
        >
          <small className="block text-[0.6rem] opacity-75">เงินสด</small>
          <span className="text-lg font-bold">{data ? formatMoney(data.cash) : "···"}</span>
        </div>
        <div
          ref={transferRef}
          className={tileClass("transfer")}
          style={tileStyle("transfer")}
          onPointerDown={(e) => handlePointerDown("transfer", e)}
          onPointerMove={(e) => handlePointerMove("transfer", e)}
          onPointerUp={() => handlePointerUp("transfer")}
          onPointerCancel={reset}
          onContextMenu={(e) => e.preventDefault()}
        >
          <small className="block text-[0.6rem] opacity-75">เงินโอน</small>
          <span className="text-lg font-bold">{data ? formatMoney(data.transfer) : "···"}</span>
        </div>
      </div>
      {onTransferRequest && (
        <p className="mt-1.5 text-center text-[0.6rem] text-white/50">
          กดค้างแล้วลากก้อนเงินไปทับอีกก้อน เพื่อโยกเงิน
        </p>
      )}
    </div>
  );
}
