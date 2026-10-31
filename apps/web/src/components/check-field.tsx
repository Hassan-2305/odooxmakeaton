import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type CheckFieldProps = Omit<ComponentProps<"input">, "type"> & { label: ReactNode; hint?: ReactNode };

/** Checkbox with its label and an optional hint; spread `register("field")` onto it. */
export function CheckField({ label, hint, className, id, ...props }: CheckFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cn("flex cursor-pointer items-start gap-2.5 text-sm", className)}>
      <input id={inputId} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...props} />
      <span className="grid gap-0.5">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
