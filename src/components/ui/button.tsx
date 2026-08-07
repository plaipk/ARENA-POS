import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Every solid variant gets the same treatment: a top-to-bottom gradient (light
// catches the top edge), a raised shadow at rest, and a pressed/inset shadow
// + slight downward shift on :active — the button physically depresses.
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold " +
    "transition-[transform,box-shadow] duration-100 disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 " +
    "active:translate-y-px",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-indigo-400 to-indigo-600 text-white border border-indigo-700/40 " +
          "shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_-2px_4px_rgba(0,0,0,0.15)_inset,0_3px_6px_-1px_rgba(49,46,129,0.5)] " +
          "hover:brightness-105 active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.4)]",
        success:
          "bg-gradient-to-b from-emerald-400 to-emerald-600 text-white border border-emerald-700/40 " +
          "shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_-2px_4px_rgba(0,0,0,0.15)_inset,0_3px_6px_-1px_rgba(6,95,70,0.5)] " +
          "hover:brightness-105 active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.4)]",
        danger:
          "bg-gradient-to-b from-rose-400 to-rose-600 text-white border border-rose-700/40 " +
          "shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_-2px_4px_rgba(0,0,0,0.15)_inset,0_3px_6px_-1px_rgba(159,18,57,0.5)] " +
          "hover:brightness-105 active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.4)]",
        warning:
          "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 border border-amber-600/40 " +
          "shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_-2px_4px_rgba(0,0,0,0.12)_inset,0_3px_6px_-1px_rgba(146,64,14,0.4)] " +
          "hover:brightness-105 active:shadow-[inset_0_2px_5px_rgba(0,0,0,0.3)]",
        outline:
          "bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] text-[var(--ink)] border border-[var(--line)] " +
          "shadow-[var(--shadow-raised-sm)] hover:brightness-[1.02] active:shadow-[var(--shadow-pressed)]",
        outlineDanger:
          "bg-gradient-to-b from-rose-50 to-rose-100 text-rose-700 border border-rose-300 " +
          "shadow-[var(--shadow-raised-sm)] hover:brightness-[1.02] active:shadow-[var(--shadow-pressed)]",
        ghost: "text-[var(--ink)] hover:bg-black/5 active:bg-black/10",
        link: "text-indigo-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-2xl px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
