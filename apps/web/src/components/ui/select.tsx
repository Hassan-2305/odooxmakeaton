import * as React from "react";
import { cn } from "@/lib/utils";

/** Native <select> styled like <Input>; used for filters and short option lists. */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-lg border border-input bg-white px-2.5 py-1 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
