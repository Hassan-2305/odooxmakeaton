import { createCustomerSchema, type CreateCustomerInput, type Customer } from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { applyApiError } from "@/lib/forms";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";

type FormIn = z.input<typeof createCustomerSchema>;

const FIELDS = [
  "name",
  "email",
  "phone",
  "gstin",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
] as const;

function defaults(c?: Customer): FormIn {
  return {
    name: c?.name ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    gstin: c?.gstin ?? "",
    addressLine1: c?.addressLine1 ?? "",
    addressLine2: c?.addressLine2 ?? "",
    city: c?.city ?? "",
    state: c?.state ?? "",
    postalCode: c?.postalCode ?? "",
    country: c?.country ?? "IN",
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this customer; omit to create one. */
  customer?: Customer;
  onSaved?: (customer: Customer) => void;
}

export function CustomerFormDialog({ open, onOpenChange, customer, onSaved }: Props) {
  const save = useApiMutation(
    (input: CreateCustomerInput) =>
      customer
        ? api<{ customer: Customer }>(`/api/customers/${customer.id}`, { method: "PATCH", body: input })
        : api<{ customer: Customer }>("/api/customers", { method: "POST", body: input }),
    ["customers", "reports"],
  );
  const form = useForm<FormIn, unknown, CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: defaults(customer),
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(defaults(customer));
  }, [open, customer, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { customer: saved } = await save.mutateAsync(values);
      toast.success(customer ? "Customer updated" : "Customer created", saved.name);
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      applyApiError(error, form.setError, FIELDS);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? "Edit customer" : "New customer"}
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel={customer ? "Save changes" : "Create customer"}
      error={errors.root?.server?.message}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" error={errors.name}>
          <Input autoFocus {...form.register("name")} />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <Input type="email" {...form.register("email")} />
        </FormField>
        <FormField label="Phone (optional)" error={errors.phone}>
          <Input type="tel" {...form.register("phone")} />
        </FormField>
        <FormField label="GSTIN (optional)" error={errors.gstin} hint="15 characters, e.g. 29ABCDE1234F1Z5">
          <Input className="uppercase" {...form.register("gstin")} />
        </FormField>
        <FormField label="Address line 1" error={errors.addressLine1} className="sm:col-span-2">
          <Input {...form.register("addressLine1")} />
        </FormField>
        <FormField label="Address line 2" error={errors.addressLine2} className="sm:col-span-2">
          <Input {...form.register("addressLine2")} />
        </FormField>
        <FormField label="City" error={errors.city}>
          <Input {...form.register("city")} />
        </FormField>
        <FormField label="State" error={errors.state}>
          <Input {...form.register("state")} />
        </FormField>
        <FormField label="PIN code" error={errors.postalCode}>
          <Input inputMode="numeric" {...form.register("postalCode")} />
        </FormField>
        <FormField label="Country" error={errors.country} hint="2-letter code">
          <Input className="uppercase" maxLength={2} {...form.register("country")} />
        </FormField>
      </div>
    </FormDialog>
  );
}
