import * as React from "react";
import { cn } from "@/lib/utils";

// Inputs read as a groove carved into the counter — inset shadow, no lift.
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)]",
          "shadow-[var(--shadow-well)] placeholder:text-[var(--ink-soft)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
