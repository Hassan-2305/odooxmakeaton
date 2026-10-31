import {
  addPaymentAllocationsSchema,
  createPaymentSchema,
  PAYMENT_METHODS,
  type AddPaymentAllocationsInput,
  type CreatePaymentInput,
  type Customer,
  type Payment,
  type PaymentDetail,
} from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { ScaledInput } from "@/components/scaled-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDate, formatMoney, humanize, todayIso } from "@/lib/format";
import { applyApiError } from "@/lib/forms";
import { useApiMutation, useOptions } from "@/lib/resources";
import { toast } from "@/lib/toast";
import { summarize, useOpenInvoices } from "@/lib/payments";
import { AllocationPicker } from "./allocation-picker";

const PAYMENT_KEYS = ["payments", "invoices", "reports", "findings"] as const;

type RecordIn = z.input<typeof createPaymentSchema>;

const blank = (): RecordIn => ({
  customerId: "",
  method: "bank_transfer",
  amountPaise: Number.NaN,
  paidOn: todayIso(),
  reference: "",
  notes: "",
  allocations: [],
});

/** Record a received payment and optionally allocate it to the customer's open invoices. */
export function RecordPaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const customers = useOptions<Customer>("customers", "/api/customers", { sort: "name" });
  const create = useApiMutation(
    (input: CreatePaymentInput) => api<{ payment: PaymentDetail }>("/api/payments", { method: "POST", body: input }),
    PAYMENT_KEYS,
  );
  const form = useForm<RecordIn, unknown, CreatePaymentInput>({ resolver: zodResolver(createPaymentSchema), defaultValues: blank() });
  const { errors, isSubmitting } = form.formState;
  const customerId = useWatch({ control: form.control, name: "customerId" });
  const amount = useWatch({ control: form.control, name: "amountPaise" });
  const allocations = useWatch({ control: form.control, name: "allocations" }) ?? [];
  const invoices = useOpenInvoices(customerId || undefined);
  const sum = summarize(amount, allocations, invoices.open);

  useEffect(() => {
    if (open) form.reset(blank());
  }, [open, form]);

  // Allocations belong to one customer's invoices.
  useEffect(() => {
    form.setValue("allocations", []);
  }, [customerId, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (sum.over) return;
    try {
      const { payment } = await create.mutateAsync({
        ...values,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
      });
      toast.success(
        "Payment recorded",
        `${formatMoney(payment.amountPaise)} from ${payment.customerName}` +
          (payment.unallocatedPaise ? ` · ${formatMoney(payment.unallocatedPaise)} unallocated` : ""),
      );
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["customerId", "method", "amountPaise", "paidOn", "reference", "notes", "allocations"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel="Record payment"
      submitDisabled={sum.over}
      error={errors.root?.server?.message}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Customer" error={errors.customerId} className="sm:col-span-2">
          <Select autoFocus {...form.register("customerId")} disabled={customers.isPending}>
            <option value="">Pick a customer…</option>
            {customers.data?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Method" error={errors.method}>
          <Select {...form.register("method")}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m === "upi" ? "UPI" : humanize(m)}
              </option>
            ))}
          </Select>
        </FormField>
        <Controller
          control={form.control}
          name="amountPaise"
          render={({ field }) => (
            <FormField label="Amount" error={errors.amountPaise}>
              <ScaledInput unit="rupees" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            </FormField>
          )}
        />
        <FormField label="Paid on" error={errors.paidOn}>
          <Input type="date" max={todayIso()} {...form.register("paidOn")} />
        </FormField>
        <FormField label="Reference (optional)" error={errors.reference} hint="UTR, cheque or transaction number">
          <Input {...form.register("reference")} />
        </FormField>
        <FormField label="Note (optional)" error={errors.notes} className="sm:col-span-2">
          <Textarea rows={2} {...form.register("notes")} />
        </FormField>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Allocate to invoices</legend>
        <AllocationPicker
          customerId={customerId || undefined}
          available={amount}
          value={allocations}
          onChange={(next) => form.setValue("allocations", next, { shouldValidate: form.formState.isSubmitted })}
          errors={errors.allocations}
        />
      </fieldset>
    </FormDialog>
  );
}

/** Allocate the unallocated part of an existing payment. */
export function AllocatePaymentDialog({ payment, onOpenChange }: { payment: Payment | null; onOpenChange: (open: boolean) => void }) {
  const allocate = useApiMutation(
    (input: AddPaymentAllocationsInput) =>
      api<{ payment: PaymentDetail }>(`/api/payments/${payment!.id}/allocations`, { method: "POST", body: input }),
    PAYMENT_KEYS,
  );
  const form = useForm<z.input<typeof addPaymentAllocationsSchema>, unknown, AddPaymentAllocationsInput>({
    resolver: zodResolver(addPaymentAllocationsSchema),
    defaultValues: { allocations: [] },
  });
  const { errors, isSubmitting } = form.formState;
  const allocations = useWatch({ control: form.control, name: "allocations" }) ?? [];
  const invoices = useOpenInvoices(payment?.customerId);
  const sum = summarize(payment?.unallocatedPaise ?? 0, allocations, invoices.open);

  useEffect(() => {
    if (payment) form.reset({ allocations: [] });
  }, [payment, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (sum.over) return;
    try {
      const { payment: p } = await allocate.mutateAsync(values);
      toast.success(
        "Payment allocated",
        `${formatMoney(sum.allocated)} applied` + (p.unallocatedPaise ? ` · ${formatMoney(p.unallocatedPaise)} still unallocated` : ""),
      );
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["allocations"]);
    }
  });

  return (
    <FormDialog
      open={payment !== null}
      onOpenChange={onOpenChange}
      title="Allocate payment"
      description={
        payment &&
        `${payment.customerName} · ${formatMoney(payment.amountPaise)} received ${formatDate(payment.paidOn)}, ${formatMoney(payment.unallocatedPaise)} not yet allocated.`
      }
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel="Allocate"
      submitDisabled={sum.over || allocations.length === 0}
      error={errors.root?.server?.message}
      size="lg"
    >
      <AllocationPicker
        customerId={payment?.customerId}
        available={payment?.unallocatedPaise ?? 0}
        value={allocations}
        onChange={(next) => form.setValue("allocations", next, { shouldValidate: form.formState.isSubmitted })}
        errors={errors.allocations}
      />
    </FormDialog>
  );
}
