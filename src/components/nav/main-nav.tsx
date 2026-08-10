"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Package, NotebookText, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "ขาย", icon: Store },
  { href: "/products", label: "สินค้า", icon: Package },
  { href: "/statement", label: "สเตทเมนต์", icon: NotebookText },
  { href: "/documents", label: "เอกสาร", icon: FileText },
] as const;

/** Shared responsive nav for all 4 pages — a pill topbar on desktop, a fixed
 * bottom tab bar on mobile (same structural pattern as the BTK reference
 * project, kept in the app's existing indigo/slate palette). Both markups
 * are always rendered; Tailwind breakpoints toggle which one is visible. */
export function MainNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: pill topbar */}
      <header className="sticky top-0 z-40 hidden border-b border-slate-200 bg-white/90 backdrop-blur md:block">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
          <span className="text-base font-bold text-indigo-600">
            ARENA<span className="font-normal text-slate-400"> POS</span>
          </span>
          <nav className="ml-auto flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                    active ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-100",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Mobile: fixed bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.06)] md:hidden">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold",
                active ? "text-indigo-600" : "text-slate-400",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
