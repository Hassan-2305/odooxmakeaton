import {
  attributeValueSchema,
  createAttributeSchema,
  createVariantSchema,
  type Attribute,
  type AttributeValue,
  type AttributeValueInput,
  type CreateAttributeInput,
  type CreateVariantInput,
} from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { CheckField } from "@/components/check-field";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { ScaledInput } from "@/components/scaled-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { applyApiError } from "@/lib/forms";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";

const CATALOG_KEYS = ["attributes", "variants", "products"] as const;

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
}

/** New product attribute with its first values (value + price extra). */
export function AttributeDialog({ open, onOpenChange, productId }: DialogProps) {
  const save = useApiMutation(
    (input: CreateAttributeInput) =>
      api<{ attribute: Attribute }>(`/api/products/${productId}/attributes`, { method: "POST", body: input }),
    CATALOG_KEYS,
  );
  const form = useForm<z.input<typeof createAttributeSchema>, unknown, CreateAttributeInput>({
    resolver: zodResolver(createAttributeSchema),
    defaultValues: { name: "", values: [{ value: "", priceExtraPaise: 0 }] },
  });
  const values = useFieldArray({ control: form.control, name: "values" });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset({ name: "", values: [{ value: "", priceExtraPaise: 0 }] });
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await save.mutateAsync(input);
      toast.success("Attribute added", input.name);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["name", "values"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add attribute"
      description="e.g. Brand with values Odoo (+₹560) and Generic (+₹0)."
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel="Add attribute"
      error={errors.root?.server?.message ?? errors.values?.root?.message ?? errors.values?.message}
      size="lg"
    >
      <FormField label="Attribute name" error={errors.name}>
        <Input autoFocus {...form.register("name")} />
      </FormField>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Values</p>
        {values.fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-[1fr_9rem_auto] items-start gap-2">
            <FormField label={<span className="sr-only">Value {i + 1}</span>} error={errors.values?.[i]?.value}>
              <Input placeholder="Value" {...form.register(`values.${i}.value`)} />
            </FormField>
            <Controller
              control={form.control}
              name={`values.${i}.priceExtraPaise`}
              render={({ field }) => (
                <FormField label={<span className="sr-only">Price extra</span>} error={errors.values?.[i]?.priceExtraPaise}>
                  <ScaledInput unit="rupees" aria-label="Price extra" value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove value"
              onClick={() => values.remove(i)}
              disabled={values.fields.length === 1}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => values.append({ value: "", priceExtraPaise: 0 })}
        >
          <PlusIcon /> Add value
        </Button>
      </div>
    </FormDialog>
  );
}

/** Add a value to an attribute, or edit one (value text and price extra). */
export function AttributeValueDialog({
  open,
  onOpenChange,
  productId,
  attribute,
  value,
}: DialogProps & { attribute: Attribute; value?: AttributeValue }) {
  const base = `/api/products/${productId}/attributes/${attribute.id}/values`;
  const save = useApiMutation(
    (input: AttributeValueInput) =>
      value ? api(`${base}/${value.id}`, { method: "PATCH", body: input }) : api(base, { method: "POST", body: input }),
    CATALOG_KEYS,
  );
  const form = useForm<z.input<typeof attributeValueSchema>, unknown, AttributeValueInput>({
    resolver: zodResolver(attributeValueSchema),
    defaultValues: { value: value?.value ?? "", priceExtraPaise: value?.priceExtraPaise ?? 0 },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset({ value: value?.value ?? "", priceExtraPaise: value?.priceExtraPaise ?? 0 });
  }, [open, value, form]);

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await save.mutateAsync(input);
      toast.success(value ? "Value updated" : "Value added", `${attribute.name}: ${input.value}`);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["value", "priceExtraPaise"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={value ? `Edit ${attribute.name} value` : `Add ${attribute.name} value`}
      description="Changing the price extra reprices every variant that uses this value."
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel={value ? "Save value" : "Add value"}
      error={errors.root?.server?.message}
    >
      <FormField label="Value" error={errors.value}>
        <Input autoFocus {...form.register("value")} />
      </FormField>
      <Controller
        control={form.control}
        name="priceExtraPaise"
        render={({ field }) => (
          <FormField label="Price extra" error={errors.priceExtraPaise} hint="Added to the product's sales price">
            <ScaledInput unit="rupees" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
          </FormField>
        )}
      />
    </FormDialog>
  );
}

type VariantForm = z.input<typeof createVariantSchema> & { picks: Record<string, string> };

/** New variant: a name and one value per attribute (at least one). The server prices it. */
export function VariantDialog({
  open,
  onOpenChange,
  productId,
  attributes,
}: DialogProps & { attributes: Attribute[] }) {
  const save = useApiMutation(
    (input: CreateVariantInput) => api("/api/variants", { method: "POST", body: { ...input, productId } }),
    CATALOG_KEYS,
  );
  const form = useForm<VariantForm>({ defaultValues: { name: "", sku: "", isActive: true, picks: {} } });
  const { errors, isSubmitting } = form.formState;
  const picks = useWatch({ control: form.control, name: "picks" });

  useEffect(() => {
    if (open) form.reset({ name: "", sku: "", isActive: true, picks: {} });
  }, [open, form]);

  const extra = attributes.reduce((sum, a) => {
    const v = a.values.find((x) => x.id === picks?.[a.id]);
    return sum + (v?.priceExtraPaise ?? 0);
  }, 0);

  const onSubmit = form.handleSubmit(async ({ name, sku, isActive, picks: chosen }) => {
    // Same shared schema as the API; picks become attributeValueIds.
    const parsed = createVariantSchema.safeParse({
      name,
      sku: sku || undefined,
      isActive,
      attributeValueIds: Object.values(chosen ?? {}).filter(Boolean),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] === "attributeValueIds" ? "root.server" : (issue.path[0] as "name" | "sku");
        form.setError(field, {
          message: issue.path[0] === "attributeValueIds" ? "Pick at least one attribute value" : issue.message,
        });
      }
      return;
    }
    try {
      await save.mutateAsync(parsed.data);
      toast.success("Variant created", parsed.data.name);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["name", "sku"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New variant"
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel="Create variant"
      error={errors.root?.server?.message}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" error={errors.name}>
          <Input autoFocus placeholder="e.g. ERP – Odoo" {...form.register("name")} />
        </FormField>
        <FormField label="SKU (optional)" error={errors.sku}>
          <Input {...form.register("sku")} />
        </FormField>
        {attributes.map((a) => (
          <FormField key={a.id} label={a.name}>
            <Select {...form.register(`picks.${a.id}`)}>
              <option value="">None</option>
              {a.values.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.value} {v.priceExtraPaise ? `(+${formatMoney(v.priceExtraPaise)})` : ""}
                </option>
              ))}
            </Select>
          </FormField>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Price extras picked: <span className="font-medium text-foreground tabular-nums">+{formatMoney(extra)}</span>. The
        final variant price is calculated by the server.
      </p>
      <CheckField label="Active" {...form.register("isActive")} />
    </FormDialog>
  );
}
