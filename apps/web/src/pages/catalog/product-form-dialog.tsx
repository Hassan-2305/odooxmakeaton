import { createProductSchema, type CreateProductInput, type Product } from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { CheckField } from "@/components/check-field";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { ScaledInput } from "@/components/scaled-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useTaxOptions } from "@/lib/catalog";
import { applyApiError } from "@/lib/forms";
import { formatBps } from "@/lib/money-input";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";

type FormIn = z.input<typeof createProductSchema>;

const defaults = (p?: Product): FormIn => ({
  name: p?.name ?? "",
  sku: p?.sku ?? "",
  basePricePaise: p?.basePricePaise ?? 0,
  description: p?.description ?? "",
  isActive: p?.isActive ?? true,
  taxIds: p?.taxIds ?? [],
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product;
  onSaved?: (product: Product) => void;
}

/** Admin only: product name, SKU, sales price, notes, default taxes and active flag. */
export function ProductFormDialog({ open, onOpenChange, product, onSaved }: Props) {
  const taxes = useTaxOptions();
  const save = useApiMutation(
    (input: CreateProductInput) =>
      product
        ? api<{ product: Product }>(`/api/products/${product.id}`, { method: "PATCH", body: input })
        : api<{ product: Product }>("/api/products", { method: "POST", body: input }),
    ["products", "variants"],
  );
  const form = useForm<FormIn, unknown, CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: defaults(product),
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(defaults(product));
  }, [open, product, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      // "" SKU means none; the API's SKU must be non-empty when present.
      const { product: saved } = await save.mutateAsync({ ...values, sku: values.sku || undefined });
      toast.success(product ? "Product updated" : "Product created", saved.name);
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      applyApiError(error, form.setError, ["name", "sku", "basePricePaise", "description", "taxIds"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={product ? "Edit product" : "New product"}
      description="Variant prices are this sales price plus the price extras of their attribute values."
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel={product ? "Save changes" : "Create product"}
      error={errors.root?.server?.message}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" error={errors.name}>
          <Input autoFocus {...form.register("name")} />
        </FormField>
        <FormField label="SKU (optional)" error={errors.sku}>
          <Input {...form.register("sku")} />
        </FormField>
        <Controller
          control={form.control}
          name="basePricePaise"
          render={({ field }) => (
            <FormField label="Sales price" error={errors.basePricePaise} hint="Before tax, per unit">
              <ScaledInput unit="rupees" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            </FormField>
          )}
        />
        <div className="flex items-end pb-2">
          <CheckField label="Active" hint="Inactive products can't be added to new subscriptions." {...form.register("isActive")} />
        </div>
        <FormField label="Notes (optional)" error={errors.description} className="sm:col-span-2">
          <Textarea rows={3} {...form.register("description")} />
        </FormField>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Default taxes</legend>
        {taxes.isPending ? (
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        ) : taxes.data?.data.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {taxes.data.data.map((t) => (
              <CheckField
                key={t.id}
                value={t.id}
                label={`${t.name} · ${formatBps(t.rateBps)}`}
                hint={t.inclusive ? "Included in price" : "Added on top"}
                {...form.register("taxIds")}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No taxes set up yet.</p>
        )}
        {errors.taxIds?.message && <p className="text-xs font-medium text-destructive">{errors.taxIds.message}</p>}
      </fieldset>
    </FormDialog>
  );
}
