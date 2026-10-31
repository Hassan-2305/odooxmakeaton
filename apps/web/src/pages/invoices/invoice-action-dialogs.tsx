import {
  cancelInvoiceSchema,
  createCreditNoteSchema,
  sendInvoiceSchema,
  type CancelInvoiceInput,
  type CreateCreditNoteInput,
  type InvoiceDetail,
  type SendInvoiceInput,
} from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { ScaledInput } from "@/components/scaled-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { applyApiError } from "@/lib/forms";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";

interface Props {
  invoice: InvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const INVOICE_KEYS = ["invoices", "reports", "findings"] as const;
const label = (inv: InvoiceDetail) => inv.number ?? "this draft";

/** Cancel with an optional reason. Invoices with payments or credit notes are refused by the API. */
export function CancelInvoiceDialog({ invoice, open, onOpenChange }: Props) {
  const cancel = useApiMutation(
    (input: CancelInvoiceInput) => api(`/api/invoices/${invoice.id}/cancel`, { method: "POST", body: input }),
    INVOICE_KEYS,
  );
  const form = useForm<z.input<typeof cancelInvoiceSchema>, unknown, CancelInvoiceInput>({
    resolver: zodResolver(cancelInvoiceSchema),
    defaultValues: { reason: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset({ reason: "" });
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await cancel.mutateAsync({ reason: values.reason || undefined });
      toast.success("Invoice cancelled", invoice.number ?? undefined);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["reason"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancel ${label(invoice)}?`}
      description="A cancelled invoice stays on record but is no longer owed. This can't be undone."
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel="Cancel invoice"
      destructive
      error={errors.root?.server?.message}
    >
      <FormField label="Reason (optional)" error={errors.reason}>
        <Textarea autoFocus rows={3} {...form.register("reason")} />
      </FormField>
    </FormDialog>
  );
}

/** Emails the invoice; the address defaults to the customer snapshot's. */
export function SendInvoiceDialog({ invoice, open, onOpenChange }: Props) {
  const defaultTo = String(invoice.customerSnapshot.email ?? "");
  const send = useApiMutation(
    (input: SendInvoiceInput) =>
      api<{ sentTo: string }>(`/api/invoices/${invoice.id}/send`, { method: "POST", body: input }),
    ["invoices"],
  );
  const form = useForm<z.input<typeof sendInvoiceSchema>, unknown, SendInvoiceInput>({
    resolver: zodResolver(sendInvoiceSchema),
    defaultValues: { to: defaultTo },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset({ to: defaultTo });
  }, [open, defaultTo, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { sentTo } = await send.mutateAsync({ to: values.to || undefined });
      toast.success("Invoice sent", `${invoice.number} emailed to ${sentTo}`);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["to"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Send ${label(invoice)}`}
      description="Emails the invoice PDF to the customer."
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel="Send invoice"
      error={errors.root?.server?.message}
    >
      <FormField label="Send to" error={errors.to}>
        <Input autoFocus type="email" {...form.register("to")} />
      </FormField>
    </FormDialog>
  );
}

/** Admin only: credit part or all of a confirmed invoice's balance. */
export function CreditNoteDialog({ invoice, open, onOpenChange }: Props) {
  const create = useApiMutation(
    (input: CreateCreditNoteInput) =>
      api(`/api/invoices/${invoice.id}/credit-notes`, { method: "POST", body: input }),
    INVOICE_KEYS,
  );
  const form = useForm<z.input<typeof createCreditNoteSchema>, unknown, CreateCreditNoteInput>({
    resolver: zodResolver(createCreditNoteSchema),
    defaultValues: { reason: "", amountPaise: invoice.balancePaise },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset({ reason: "", amountPaise: invoice.balancePaise });
  }, [open, invoice.balancePaise, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (values.amountPaise > invoice.balancePaise) {
      form.setError("amountPaise", { message: `Can't exceed the balance of ${formatMoney(invoice.balancePaise)}` });
      return;
    }
    try {
      await create.mutateAsync(values);
      toast.success("Credit note issued", `${formatMoney(values.amountPaise)} credited to ${invoice.number}`);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["reason", "amountPaise"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Credit note for ${label(invoice)}`}
      description="Confirmed invoices can't be edited; a credit note reduces what the customer owes. The server splits the amount into net and tax."
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel="Issue credit note"
      error={errors.root?.server?.message}
    >
      <Controller
        control={form.control}
        name="amountPaise"
        render={({ field }) => (
          <FormField
            label="Amount (incl. tax)"
            error={errors.amountPaise}
            hint={`Up to the balance of ${formatMoney(invoice.balancePaise)}`}
          >
            <ScaledInput unit="rupees" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
          </FormField>
        )}
      />
      <FormField label="Reason" error={errors.reason}>
        <Textarea autoFocus rows={3} placeholder="e.g. Service outage on 12 Oct, 3 days credited" {...form.register("reason")} />
      </FormField>
    </FormDialog>
  );
}
