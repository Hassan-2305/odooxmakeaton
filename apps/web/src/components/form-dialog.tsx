import type { FormEventHandler, ReactNode } from "react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitting: boolean;
  submitLabel: string;
  /** Form-level server error (root.server). */
  error?: string;
  /** Wider dialog for forms with line items. */
  size?: "md" | "lg" | "xl";
  destructive?: boolean;
  /** Disables submit, e.g. while an allocation is over the payment amount. */
  submitDisabled?: boolean;
  children: ReactNode;
}

/** Dialog wrapping a React Hook Form: header, form-level error, fields, and Cancel/Submit. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitting,
  submitLabel,
  error,
  size = "md",
  destructive,
  submitDisabled,
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent
        className={cn(
          "max-h-[calc(100svh-2rem)] overflow-y-auto",
          size === "lg" && "sm:max-w-2xl",
          size === "xl" && "sm:max-w-4xl",
        )}
      >
        <form onSubmit={onSubmit} noValidate className="grid min-w-0 gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <FormAlert>{error}</FormAlert>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={submitting || submitDisabled}
            >
              {submitting ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
