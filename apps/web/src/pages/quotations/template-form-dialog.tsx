import {
  createQuotationTemplateSchema,
  type CreateQuotationTemplateInput,
  type Product,
  type QuotationTemplate,
} from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect } from "react";
import { useFieldArray, useForm, useWatch, type Control, type UseFormRegister, type FieldErrors } from "react-hook-form";
import type { z } from "zod";
import { CheckField } from "@/components/check-field";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { planPrice, usePlanOptions, useProductOptions, useVariantOptions } from "@/lib/catalog";
import { formatMoney } from "@/lib/format";
import { applyApiError } from "@/lib/forms";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";

type FormIn = z.input<typeof createQuotationTemplateSchema>;

const emptyLine = { productId: "", variantId: null, quantity: 1, description: "" };

const defaults = (t?: QuotationTemplate): FormIn => ({
  name: t?.name ?? "",
  validityDays: t?.validityDays ?? 30,
  recurringPlanId: t?.recurringPlanId ?? null,
  notes: t?.notes ?? "",
  isActive: t?.isActive ?? true,
  lines: t?.lines.map((l) => ({
    productId: l.productId,
    variantId: l.variantId,
    quantity: l.quantity,
    description: l.description ?? "",
  })) ?? [emptyLine],
});

function LineRow({
  index,
  control,
  register,
  errors,
  products,
  onRemove,
  canRemove,
}: {
  index: number;
  control: Control<FormIn, unknown, CreateQuotationTemplateInput>;
  register: UseFormRegister<FormIn>;
  errors: FieldErrors<FormIn>;
  products: Product[];
  onRemove: () => void;
  canRemove: boolean;
}) {
  const productId = useWatch({ control, name: `lines.${index}.productId` });
  const variantId = useWatch({ control, name: `lines.${index}.variantId` });
  const variants = useVariantOptions(productId || undefined);
  const product = products.find((p) => p.id === productId);
  const variant = variants.data?.data.find((v) => v.id === variantId);
  // Catalog price for reference; subscriptions snapshot the price server-side when created.
  const unitPrice = variant?.pricePaise ?? product?.basePricePaise;
  const err = errors.lines?.[index];

  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1.4fr_1.4fr_5rem_8rem_auto] sm:items-start sm:border-0 sm:p-0">
      <FormField label={<span className="sm:sr-only">Product</span>} error={err?.productId}>
        <Select {...register(`lines.${index}.productId`)}>
          <option value="">Product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={<span className="sm:sr-only">Variant</span>} error={err?.variantId}>
        <Select
          {...register(`lines.${index}.variantId`, { setValueAs: (v: string) => v || null })}
          disabled={!productId || variants.isPending}
        >
          <option value="">{variants.data?.data.length ? "No variant" : "No variants"}</option>
          {variants.data?.data.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={<span className="sm:sr-only">Qty</span>} error={err?.quantity}>
        <Input type="number" min={1} aria-label="Quantity" {...register(`lines.${index}.quantity`, { valueAsNumber: true })} />
      </FormField>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium sm:sr-only">Unit price</span>
        <p className="flex h-9 items-center justify-end rounded-md bg-surface px-3 text-sm tabular-nums" aria-label="Unit price">
          {unitPrice === undefined ? "—" : formatMoney(unitPrice)}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={onRemove} disabled={!canRemove}>
        <Trash2Icon />
      </Button>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: QuotationTemplate;
}

/** Admin only: template name, plan, validity days and lines (product, variant, quantity). */
export function TemplateFormDialog({ open, onOpenChange, template }: Props) {
  const products = useProductOptions({ isActive: "true" });
  const plans = usePlanOptions({ isActive: "true" });
  const save = useApiMutation(
    (input: CreateQuotationTemplateInput) =>
      template
        ? api<{ template: QuotationTemplate }>(`/api/quotation-templates/${template.id}`, { method: "PATCH", body: input })
        : api<{ template: QuotationTemplate }>("/api/quotation-templates", { method: "POST", body: input }),
    ["templates"],
  );
  const form = useForm<FormIn, unknown, CreateQuotationTemplateInput>({
    resolver: zodResolver(createQuotationTemplateSchema),
    defaultValues: defaults(template),
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(defaults(template));
  }, [open, template, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const body = {
        ...values,
        lines: values.lines.map((l, i) => ({ ...l, description: l.description || undefined, sortOrder: i })),
      };
      const { template: saved } = await save.mutateAsync(body);
      toast.success(template ? "Template updated" : "Template created", saved.name);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["name", "validityDays", "recurringPlanId", "notes", "lines"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={template ? "Edit quotation template" : "New quotation template"}
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel={template ? "Save changes" : "Create template"}
      error={errors.root?.server?.message ?? errors.lines?.root?.message ?? errors.lines?.message}
      size="xl"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Name" error={errors.name} className="sm:col-span-2">
          <Input autoFocus {...form.register("name")} />
        </FormField>
        <FormField label="Valid for (days)" error={errors.validityDays} hint="How long a quotation stays open">
          <Input type="number" min={1} max={365} {...form.register("validityDays", { valueAsNumber: true })} />
        </FormField>
        <FormField label="Recurring plan" error={errors.recurringPlanId} className="sm:col-span-2" hint="Optional; can be picked when creating a subscription">
          <Select {...form.register("recurringPlanId", { setValueAs: (v: string) => v || null })} disabled={plans.isPending}>
            <option value="">Choose when creating</option>
            {plans.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {planPrice(p)}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex items-end pb-2">
          <CheckField label="Active" {...form.register("isActive")} />
        </div>
      </div>

      <div className="grid gap-2">
        <div className="hidden grid-cols-[1.4fr_1.4fr_5rem_8rem_2.25rem] gap-2 text-sm font-medium text-muted-foreground sm:grid">
          <span>Product</span>
          <span>Variant</span>
          <span>Qty</span>
          <span className="text-right">Unit price</span>
          <span />
        </div>
        {lines.fields.map((f, i) => (
          <LineRow
            key={f.id}
            index={i}
            control={form.control}
            register={form.register}
            errors={errors}
            products={products.data?.data ?? []}
            onRemove={() => lines.remove(i)}
            canRemove={lines.fields.length > 1}
          />
        ))}
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => lines.append(emptyLine)}>
          <PlusIcon /> Add line
        </Button>
        <p className="text-xs text-muted-foreground">
          Unit prices come from the catalog. Each subscription snapshots the price when it's created.
        </p>
      </div>

      <FormField label="Notes (optional)" error={errors.notes}>
        <Textarea rows={2} {...form.register("notes")} />
      </FormField>
    </FormDialog>
  );
}
