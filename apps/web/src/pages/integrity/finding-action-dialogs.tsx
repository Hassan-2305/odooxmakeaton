import {
  dismissFindingSchema,
  resolveFindingSchema,
  type DismissFindingInput,
  type FindingRule,
  type IntegrityFinding,
  type ResolveFindingInput,
} from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { applyApiError } from "@/lib/forms";
import { RULE_INFO, ruleLabel, useDismissFinding, useResolveFinding } from "@/lib/integrity";
import { toast } from "@/lib/toast";

interface ActionDialogProps {
  finding: IntegrityFinding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Confirms dismissing a finding as a false positive; a note explaining why is required. */
export function DismissFindingDialog({ finding, open, onOpenChange }: ActionDialogProps) {
  const dismiss = useDismissFinding(finding.id);
  const form = useForm<z.input<typeof dismissFindingSchema>, unknown, DismissFindingInput>({
    resolver: zodResolver(dismissFindingSchema),
    defaultValues: { note: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset({ note: "" });
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await dismiss.mutateAsync(values);
      toast.success("Finding dismissed", `${ruleLabel(finding.rule)} marked as not an issue.`);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["note"]);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Dismiss this finding?</DialogTitle>
            <DialogDescription>
              It will be closed as a false positive and drop out of the open list. It can reappear if a later scan
              still detects it.
            </DialogDescription>
          </DialogHeader>
          <FormAlert>{errors.root?.server?.message}</FormAlert>
          <FormField label="Why is this not an issue?" error={errors.note}>
            <Textarea autoFocus placeholder="e.g. Customer paid in advance; allocation pending." {...form.register("note")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? "Dismissing…" : "Dismiss finding"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Admin only: records how a finding was fixed. */
export function ResolveFindingDialog({ finding, open, onOpenChange }: ActionDialogProps) {
  const resolve = useResolveFinding(finding.id);
  const listId = useId();
  const suggestions = RULE_INFO[finding.rule as FindingRule]?.resolutions ?? [];
  const form = useForm<z.input<typeof resolveFindingSchema>, unknown, ResolveFindingInput>({
    resolver: zodResolver(resolveFindingSchema),
    defaultValues: { action: "", note: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset({ action: "", note: "" });
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await resolve.mutateAsync({ action: values.action, note: values.note || undefined });
      toast.success("Finding resolved", values.action);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["action", "note"]);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Resolve finding</DialogTitle>
            <DialogDescription>
              Record what was done to fix it. This only logs the decision; make the correction itself (credit note,
              allocation, invoice) separately.
            </DialogDescription>
          </DialogHeader>
          <FormAlert>{errors.root?.server?.message}</FormAlert>
          <FormField label="Action taken" error={errors.action}>
            <Input autoFocus list={listId} placeholder="e.g. Duplicate cancelled" {...form.register("action")} />
          </FormField>
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <FormField label="Note (optional)" error={errors.note}>
            <Textarea {...form.register("note")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Resolving…" : "Mark resolved"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
