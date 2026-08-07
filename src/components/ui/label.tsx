import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--ink-soft)]",
        className,
      )}
      {...props}
    />
  );
}
