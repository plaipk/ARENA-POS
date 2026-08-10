"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/** Bottom-anchored action sheet — same Radix Dialog primitives as `dialog.tsx`,
 * just positioned flush to the bottom of the viewport instead of centered.
 * Used for the mobile "tap a row, pick an action" pattern (documents list). */
const BottomSheet = DialogPrimitive.Root;
const BottomSheetClose = DialogPrimitive.Close;

function BottomSheetOverlay({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 bg-black/40", className)} {...props} />;
}

function BottomSheetContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <BottomSheetOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] w-full flex-col gap-2 overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl",
          className,
        )}
        {...props}
      >
        <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-slate-200" />
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function BottomSheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-slate-100 pb-2 text-center text-sm font-bold text-slate-800", className)}
      {...props}
    />
  );
}

const BottomSheetTitle = DialogPrimitive.Title;

export { BottomSheet, BottomSheetClose, BottomSheetContent, BottomSheetHeader, BottomSheetTitle };
