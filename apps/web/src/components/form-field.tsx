import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import type { FieldError } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: ReactNode;
  /** React Hook Form error for this field; zod messages arrive here via zodResolver. */
  error?: FieldError | string;
  hint?: ReactNode;
  /** A single input element; it receives id, aria-invalid and aria-describedby. */
  children: ReactElement<{ id?: string }>;
  /** Extra content on the label row, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode;
  className?: string;
}

export function FormField({ label, error, hint, children, labelAside, className }: FormFieldProps) {
  const autoId = useId();
  const id = children.props.id ?? autoId;
  const message = friendly(typeof error === "string" ? error : error?.message);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = message ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        "aria-invalid": message ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {hint && !message && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {message && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}

/** zod's type errors ("Invalid input: expected number, received NaN") read badly under a field. */
function friendly(message: string | undefined): string | undefined {
  if (!message) return message;
  if (/expected number/i.test(message)) return "Enter a number";
  if (/expected string, received (undefined|null)/i.test(message)) return "Required";
  if (/invalid (iso )?date/i.test(message)) return "Enter a valid date";
  if (/invalid uuid/i.test(message)) return "Pick one";
  return message;
}
