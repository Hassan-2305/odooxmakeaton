import {
  subscriptionTransitionSchema,
  type SubscriptionDetail,
  type SubscriptionTransitionInput,
} from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { applyApiError } from "@/lib/forms";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";
import type { TransitionAction } from "./transitions";

interface Props {
  subscription: SubscriptionDetail;
  action: TransitionAction | null;
  onOpenChange: (open: boolean) => void;
}

/** Confirms one status move with an optional note (and a new expiry date for renew). */
export function TransitionDialog({ subscription, action, onOpenChange }: Props) {
  const move = useApiMutation(
    (input: SubscriptionTransitionInput) =>
      api<{ subscription: SubscriptionDetail }>(`/api/subscriptions/${subscription.id}/transition`, {
        method: "POST",
        body: input,
      }),
    ["subscriptions", "reports", "findings"],
  );
  const form = useForm<z.input<typeof subscriptionTransitionSchema>, unknown, SubscriptionTransitionInput>({
    resolver: zodResolver(subscriptionTransitionSchema),
    defaultValues: { to: "active", note: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (action) form.reset({ to: action.to, note: "", expiryDate: undefined });
  }, [action, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { subscription: s } = await move.mutateAsync({
        ...values,
        note: values.note || undefined,
        expiryDate: values.expiryDate || undefined,
      });
      toast.success(
        action?.to === "renew" ? "Subscription renewed" : `Subscription ${action?.label.toLowerCase()}`,
        action?.to === "renew" ? `${s.number} now expires ${formatDate(s.expiryDate)}` : `${s.number} is now ${s.status}`,
      );
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["note", "expiryDate"]);
    }
  });

  return (
    <FormDialog
      open={action !== null}
      onOpenChange={onOpenChange}
      title={`${action?.label ?? ""} ${subscription.number}?`}
      description={action?.description}
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel={action?.label ?? "Confirm"}
      destructive={action?.destructive}
      error={errors.root?.server?.message}
    >
      {action?.to === "renew" && (
        <FormField
          label="New expiry date (optional)"
          error={errors.expiryDate}
          hint={`Currently ${formatDate(subscription.expiryDate)}. Leave empty to extend by one period.`}
        >
          <Input
            type="date"
            min={subscription.expiryDate ?? undefined}
            {...form.register("expiryDate", { setValueAs: (v: string) => v || undefined })}
          />
        </FormField>
      )}
      <FormField label="Note (optional)" error={errors.note} hint="Saved on the subscription's timeline.">
        <Textarea rows={3} {...form.register("note")} />
      </FormField>
    </FormDialog>
  );
}
