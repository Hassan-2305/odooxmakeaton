import {
  subscriptionFromTemplateSchema,
  type Customer,
  type QuotationTemplate,
  type Subscription,
  type SubscriptionFromTemplateInput,
} from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import type { z } from "zod";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { planPrice, usePlanOptions } from "@/lib/catalog";
import { todayIso } from "@/lib/format";
import { applyApiError } from "@/lib/forms";
import { useApiMutation, useOptions } from "@/lib/resources";
import { toast } from "@/lib/toast";

type FormIn = z.input<typeof subscriptionFromTemplateSchema>;

interface Props {
  template: QuotationTemplate | null;
  onOpenChange: (open: boolean) => void;
}

/** Creates a subscription (as a quotation) from a template, then opens it. */
export function FromTemplateDialog({ template, onOpenChange }: Props) {
  const navigate = useNavigate();
  const customers = useOptions<Customer>("customers", "/api/customers", { sort: "name" });
  const plans = usePlanOptions({ isActive: "true", sellableOn: todayIso() });
  const create = useApiMutation(
    (input: SubscriptionFromTemplateInput) =>
      api<{ subscription: Subscription }>(`/api/subscriptions/from-template/${template!.id}`, {
        method: "POST",
        body: input,
      }),
    ["subscriptions", "reports"],
  );
  const blank: FormIn = { customerId: "", startDate: todayIso(), recurringPlanId: undefined, notes: "" };
  const form = useForm<FormIn, unknown, SubscriptionFromTemplateInput>({
    resolver: zodResolver(subscriptionFromTemplateSchema),
    defaultValues: blank,
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (template) form.reset({ ...blank, startDate: todayIso() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when a template is opened
  }, [template, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!template) return;
    if (!template.recurringPlanId && !values.recurringPlanId) {
      form.setError("recurringPlanId", { message: "This template has no plan; pick one" });
      return;
    }
    try {
      const { subscription } = await create.mutateAsync({ ...values, notes: values.notes || undefined });
      toast.success("Subscription created", `${subscription.number} for ${subscription.customerName}`);
      onOpenChange(false);
      navigate(`/subscriptions/${subscription.id}`);
    } catch (error) {
      applyApiError(error, form.setError, ["customerId", "startDate", "recurringPlanId", "expiryDate", "notes"]);
    }
  });

  return (
    <FormDialog
      open={template !== null}
      onOpenChange={onOpenChange}
      title="Create subscription from template"
      description={template && `${template.name}: ${template.lines.length} line${template.lines.length === 1 ? "" : "s"}, quotation valid ${template.validityDays} days.`}
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel="Create subscription"
      error={errors.root?.server?.message}
    >
      <FormField label="Customer" error={errors.customerId}>
        <Select autoFocus {...form.register("customerId")} disabled={customers.isPending}>
          <option value="">Pick a customer…</option>
          {customers.data?.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Start date" error={errors.startDate}>
        <Input type="date" {...form.register("startDate")} />
      </FormField>
      <FormField
        label={template?.recurringPlanId ? "Plan (optional override)" : "Plan"}
        error={errors.recurringPlanId}
      >
        <Select {...form.register("recurringPlanId", { setValueAs: (v: string) => v || undefined })} disabled={plans.isPending}>
          <option value="">{template?.recurringPlanId ? "Use the template's plan" : "Pick a plan…"}</option>
          {plans.data?.data.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {planPrice(p)}
            </option>
          ))}
        </Select>
      </FormField>
    </FormDialog>
  );
}
