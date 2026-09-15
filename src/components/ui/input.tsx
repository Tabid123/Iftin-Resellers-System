import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, inputMode, pattern, ...props }, ref) => {
    // Numeric fields must always open the digits-only keypad on mobile.
    // Capacitor's Android WebView is most reliable when numeric-only fields
    // have both inputmode="numeric" and the native telephone input type.
    const resolvedType = type ?? (inputMode === "numeric" ? "tel" : undefined);
    const isTel = resolvedType === "tel";
    const isNumber = type === "number";
    const resolvedInputMode =
      inputMode ?? (isTel ? "numeric" : isNumber ? "decimal" : undefined);
    const resolvedPattern =
      pattern ?? (isTel || resolvedInputMode === "numeric" ? "[0-9]*" : undefined);

    return (
      <input
        type={resolvedType}
        inputMode={resolvedInputMode}
        pattern={resolvedPattern}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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
