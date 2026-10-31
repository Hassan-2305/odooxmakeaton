import { PORTAL_REQUEST_TYPES, portalRequestSchema, type PortalRequestInput } from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyApiError } from "@/lib/forms";
import { REQUESTABLE_STATUSES, usePortalRequest, usePortalSubscriptions } from "@/lib/portal";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<PortalRequestInput["type"], { title: string; hint: string }> = {
  change: { title: "Change plan or quantity", hint: "Upgrade, downgrade, or change seats or add-ons." },
  cancel: { title: "Cancel subscription", hint: "Stop the subscription. Our team will confirm the end date." },
};

interface RequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects a subscription, e.g. when opened from its row. */
  subscriptionId?: string;
  type?: PortalRequestInput["type"];
}

type FormInput = z.input<typeof portalRequestSchema>;

/** Customer asks to cancel or change a subscription. Cancellations need an extra confirmation. */
export function RequestDialog({ open, onOpenChange, subscriptionId, type = "change" }: RequestDialogProps) {
  const subscriptions = usePortalSubscriptions();
  const request = usePortalRequest();
  const [pendingCancel, setPendingCancel] = useState<PortalRequestInput | null>(null);
  const eligible = (subscriptions.data ?? []).filter((s) => REQUESTABLE_STATUSES.has(s.status));

  const form = useForm<FormInput, unknown, PortalRequestInput>({
    resolver: zodResolver(portalRequestSchema),
    defaultValues: { type, subscriptionId: subscriptionId ?? "", message: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const selectedType = useWatch({ control: form.control, name: "type" });

  useEffect(() => {
    if (open) form.reset({ type, subscriptionId: subscriptionId ?? "", message: "" });
  }, [open, type, subscriptionId, form]);

  // Single eligible subscription: pick it for the customer.
  useEffect(() => {
    if (open && !form.getValues("subscriptionId") && eligible.length === 1) {
      form.setValue("subscriptionId", eligible[0]!.id);
    }
  }, [open, eligible, form]);

  const send = async (values: PortalRequestInput) => {
    await request.mutateAsync(values);
    const sub = eligible.find((s) => s.id === values.subscriptionId);
    toast.success(
      values.type === "cancel" ? "Cancellation request sent" : "Change request sent",
      `We'll review your request for ${sub?.number ?? "your subscription"} and get back to you by email.`,
    );
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (values.type === "cancel") {
      setPendingCancel(values);
      return;
    }
    try {
      await send(values);
    } catch (error) {
      applyApiError(error, form.setError, ["type", "subscriptionId", "message"]);
    }
  });

  return (
    <>
      <Dialog open={open && !pendingCancel} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Request a change</DialogTitle>
              <DialogDescription>Tell us what you need. Nothing changes until our team confirms it.</DialogDescription>
            </DialogHeader>
            <FormAlert>{errors.root?.server?.message}</FormAlert>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">What would you like to do?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {PORTAL_REQUEST_TYPES.map((t) => (
                  <label
                    key={t}
                    className={cn(
                      "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                      selectedType === t ? "border-primary bg-accent/40" : "hover:bg-surface",
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <input type="radio" value={t} className="accent-primary" {...form.register("type")} />
                      {TYPE_LABELS[t].title}
                    </span>
                    <span className="pl-5 text-xs text-muted-foreground">{TYPE_LABELS[t].hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <FormField
              label="Subscription"
              error={errors.subscriptionId && "Choose a subscription"}
              hint={subscriptions.isError ? "Couldn't load your subscriptions. Close and try again." : undefined}
            >
              <Select disabled={subscriptions.isPending} {...form.register("subscriptionId")}>
                <option value="">{subscriptions.isPending ? "Loading…" : "Choose a subscription"}</option>
                {eligible.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.number} · {s.planName}
                  </option>
                ))}
              </Select>
            </FormField>
            {subscriptions.isSuccess && eligible.length === 0 && (
              <FormAlert>You have no active, paused or quoted subscriptions to change.</FormAlert>
            )}

            <FormField label="Details" error={errors.message}>
              <Textarea
                rows={4}
                placeholder={
                  selectedType === "cancel"
                    ? "Why are you cancelling, and from when?"
                    : "e.g. Move us to the annual plan and add 5 seats from next month."
                }
                {...form.register("message")}
              />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={selectedType === "cancel" ? "destructive" : "default"}
                disabled={isSubmitting || eligible.length === 0}
              >
                {isSubmitting ? "Sending…" : selectedType === "cancel" ? "Request cancellation" : "Send request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingCancel !== null}
        onOpenChange={(next) => {
          if (!next) setPendingCancel(null);
        }}
        destructive
        title="Request cancellation?"
        description="We'll start cancelling this subscription once our team confirms. You can still be billed for the current period."
        confirmLabel="Yes, request cancellation"
        cancelLabel="Go back"
        onConfirm={async () => {
          await send(pendingCancel!);
          setPendingCancel(null);
        }}
      />
    </>
  );
}
