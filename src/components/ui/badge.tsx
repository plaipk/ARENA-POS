import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Small embossed pills — inset shadow gives a stamped-in-leather look.
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold shadow-[inset_0_1px_2px_rgba(0,0,0,0.12),0_1px_0_rgba(255,255,255,0.5)]",
  {
    variants: {
      variant: {
        default: "border-[var(--line)] bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)] text-[var(--ink-soft)]",
        success: "border-emerald-300 bg-gradient-to-b from-emerald-100 to-emerald-200 text-emerald-800",
        danger: "border-rose-300 bg-gradient-to-b from-rose-100 to-rose-200 text-rose-800",
        warning: "border-amber-300 bg-gradient-to-b from-amber-100 to-amber-200 text-amber-900",
        info: "border-sky-300 bg-gradient-to-b from-sky-100 to-sky-200 text-sky-800",
        dark: "border-slate-900 bg-gradient-to-b from-slate-700 to-slate-900 text-white",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
