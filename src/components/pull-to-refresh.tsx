"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

const TRIGGER_DISTANCE = 70; // px pulled down before release triggers a refresh
const MAX_PULL = 110;

/** Mobile "ดึงลงเพื่อรีเฟรช" gesture — touch-only (desktop mouse users never
 * trigger it), active only when the page is scrolled to the very top. On
 * release past the threshold it invalidates every React Query cache (a soft
 * refresh — refetches whatever the current page is showing — instead of a
 * jarring full page reload). */
export function PullToRefresh() {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || refreshing) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling.current || startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // Only take over the gesture once it's clearly a downward pull at the
      // top of the page — otherwise let normal scrolling behave normally.
      if (window.scrollY > 0) {
        pulling.current = false;
        setPull(0);
        return;
      }
      setPull(Math.min(delta * 0.5, MAX_PULL));
    }

    async function onTouchEnd() {
      if (!pulling.current) return;
      pulling.current = false;
      startY.current = null;
      if (pull >= TRIGGER_DISTANCE) {
        setRefreshing(true);
        await queryClient.invalidateQueries();
        setRefreshing(false);
      }
      setPull(0);
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pull, refreshing]);

  const visible = pull > 0 || refreshing;
  const height = refreshing ? 44 : pull;

  return (
    <div
      className="flex items-center justify-center gap-1.5 overflow-hidden text-xs text-slate-400 transition-[height] md:hidden"
      style={{ height: visible ? height : 0 }}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing || pull >= TRIGGER_DISTANCE ? "animate-spin" : ""}`} />
      <span>{refreshing ? "กำลังรีเฟรช..." : pull >= TRIGGER_DISTANCE ? "ปล่อยเพื่อรีเฟรช" : "ดึงลงเพื่อรีเฟรช"}</span>
    </div>
  );
}
