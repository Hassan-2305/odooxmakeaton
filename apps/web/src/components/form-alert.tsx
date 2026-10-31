import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Form-level message: an error from the server, or a success notice. */
export function FormAlert({
  children,
  variant = "error",
  className,
}: {
  children: ReactNode;
  variant?: "error" | "success";
  className?: string;
}) {
  if (!children) return null;
  const Icon = variant === "error" ? AlertCircleIcon : CheckCircle2Icon;
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
        variant === "error" ? "bg-status-overdue-bg text-status-overdue-fg" : "bg-status-paid-bg text-status-paid-fg",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
