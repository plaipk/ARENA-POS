import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
  {
    variants: {
      variant: {
        default: "bg-slate-100 text-slate-700",
        success: "bg-emerald-100 text-emerald-700",
        danger: "bg-rose-100 text-rose-700",
        warning: "bg-amber-100 text-amber-800",
        info: "bg-sky-100 text-sky-700",
        dark: "bg-slate-800 text-white",
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
