import {
  createDiscountRuleSchema,
  DISCOUNT_SCOPES,
  type CreateDiscountRuleInput,
  type DiscountRule,
} from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { PercentIcon, PlusIcon } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { CheckField } from "@/components/check-field";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { ClearFilters, FilterSelect, SearchFilter } from "@/components/list-filters";
import { ScaledInput } from "@/components/scaled-input";
import { ActiveBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useProductOptions } from "@/lib/catalog";
import { formatCount, formatDate, formatMoney, humanize } from "@/lib/format";
import { applyApiError } from "@/lib/forms";
import { useListQuery, useListState } from "@/lib/list";
import { formatBps } from "@/lib/money-input";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";
import { useRowActions } from "./row-actions";

type FormIn = z.input<typeof createDiscountRuleSchema>;

const nullDate = { setValueAs: (v: string) => v || null };

const defaults = (d?: DiscountRule): FormIn => ({
  name: d?.name ?? "",
  code: d?.code ?? "",
  type: d?.type ?? "percent",
  value: d?.value ?? 1000,
  minAmountPaise: d?.minAmountPaise ?? 0,
  minQty: d?.minQty ?? 1,
  validFrom: d?.validFrom ?? null,
  validTo: d?.validTo ?? null,
  usageLimit: d?.usageLimit ?? null,
  scope: d?.scope ?? "subscription",
  productId: d?.productId ?? null,
  isActive: d?.isActive ?? true,
});

const discountValue = (d: Pick<DiscountRule, "type" | "value">) =>
  d.type === "percent" ? formatBps(d.value) : formatMoney(d.value);

/** "used 3 of 10", or "used 3" with no limit. */
const usage = (d: Pick<DiscountRule, "usedCount" | "usageLimit">) =>
  d.usageLimit ? `used ${formatCount(d.usedCount)} of ${formatCount(d.usageLimit)}` : `used ${formatCount(d.usedCount)}`;

function DiscountFormDialog({
  open,
  onOpenChange,
  discount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  discount?: DiscountRule;
}) {
  const products = useProductOptions();
  const save = useApiMutation(
    (input: CreateDiscountRuleInput) =>
      discount
        ? api<{ discount: DiscountRule }>(`/api/discounts/${discount.id}`, { method: "PATCH", body: input })
        : api<{ discount: DiscountRule }>("/api/discounts", { method: "POST", body: input }),
    ["discounts"],
  );
  const form = useForm<FormIn, unknown, CreateDiscountRuleInput>({
    resolver: zodResolver(createDiscountRuleSchema),
    defaultValues: defaults(discount),
  });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: "type" });
  const scope = useWatch({ control: form.control, name: "scope" });

  useEffect(() => {
    if (open) form.reset(defaults(discount));
  }, [open, discount, form]);

  // A subscription-wide rule must not carry a product.
  useEffect(() => {
    if (scope === "subscription") form.setValue("productId", null);
  }, [scope, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { discount: saved } = await save.mutateAsync({ ...values, code: values.code || null });
      toast.success(discount ? "Discount updated" : "Discount created", saved.name);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, [
        "name",
        "code",
        "type",
        "value",
        "minAmountPaise",
        "minQty",
        "validFrom",
        "validTo",
        "usageLimit",
        "scope",
        "productId",
      ]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={discount ? "Edit discount" : "New discount"}
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel={discount ? "Save changes" : "Create discount"}
      error={errors.root?.server?.message}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" error={errors.name}>
          <Input autoFocus {...form.register("name")} />
        </FormField>
        <FormField label="Code (optional)" error={errors.code} hint="3–32 letters, digits, - or _">
          <Input className="uppercase" {...form.register("code")} />
        </FormField>
        <FormField label="Type" error={errors.type}>
          <Select {...form.register("type")}>
            <option value="percent">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </Select>
        </FormField>
        <Controller
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormField label={type === "percent" ? "Percentage off" : "Amount off"} error={errors.value}>
              <ScaledInput
                unit={type === "percent" ? "percent" : "rupees"}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="minAmountPaise"
          render={({ field }) => (
            <FormField label="Minimum amount" error={errors.minAmountPaise} hint="Invoice subtotal needed; 0 for none">
              <ScaledInput unit="rupees" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            </FormField>
          )}
        />
        <FormField label="Minimum quantity" error={errors.minQty}>
          <Input type="number" min={1} {...form.register("minQty", { valueAsNumber: true })} />
        </FormField>
        <FormField label="Valid from (optional)" error={errors.validFrom}>
          <Input type="date" {...form.register("validFrom", nullDate)} />
        </FormField>
        <FormField label="Valid to (optional)" error={errors.validTo}>
          <Input type="date" {...form.register("validTo", nullDate)} />
        </FormField>
        <FormField
          label="Usage limit (optional)"
          error={errors.usageLimit}
          hint={discount ? `Currently ${usage(discount)}` : "Leave empty for unlimited"}
        >
          <Input
            type="number"
            min={1}
            {...form.register("usageLimit", { setValueAs: (v: string) => (v === "" || v === null ? null : Number(v)) })}
          />
        </FormField>
        <FormField label="Applies to" error={errors.scope}>
          <Select {...form.register("scope")}>
            <option value="subscription">Whole subscription</option>
            <option value="product">One product</option>
          </Select>
        </FormField>
        {scope === "product" && (
          <FormField label="Product" error={errors.productId} className="sm:col-span-2">
            <Select {...form.register("productId", { setValueAs: (v: string) => v || null })} disabled={products.isPending}>
              <option value="">Pick a product…</option>
              {products.data?.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>
      <CheckField label="Active" {...form.register("isActive")} />
    </FormDialog>
  );
}

/** Admin only (the API's discount routes are admin-only, reads included). */
export function DiscountsTab() {
  const list = useListState({ sort: "-createdAt", exclude: ["tab"] });
  const query = useListQuery<DiscountRule>("discounts", "/api/discounts", list);
  const products = useProductOptions();
  const rows = useRowActions<DiscountRule>("/api/discounts", ["discounts"]);
  const productName = (id: string | null) => products.data?.data.find((p) => p.id === id)?.name ?? "…";

  const columns: DataTableColumn<DiscountRule>[] = [
    {
      id: "name",
      header: "Discount",
      sortField: "name",
      cell: (d) => (
        <span>
          <span className="font-medium">{d.name}</span>
          {d.code && <span className="ml-2 font-mono text-xs text-muted-foreground">{d.code}</span>}
        </span>
      ),
    },
    { id: "value", header: "Value", align: "right", className: "tabular-nums whitespace-nowrap", cell: discountValue },
    {
      id: "min",
      header: "Minimums",
      className: "whitespace-nowrap text-muted-foreground",
      cell: (d) => `${d.minAmountPaise ? formatMoney(d.minAmountPaise) : "Any amount"} · qty ${d.minQty}+`,
    },
    {
      id: "valid",
      header: "Valid",
      sortField: "validFrom",
      className: "whitespace-nowrap",
      cell: (d) => (d.validFrom || d.validTo ? `${formatDate(d.validFrom)} – ${formatDate(d.validTo)}` : "Always"),
    },
    { id: "usage", header: "Usage", cell: usage },
    { id: "scope", header: "Scope", cell: (d) => (d.scope === "product" ? `Product: ${productName(d.productId)}` : "Subscription") },
    { id: "active", header: "Status", cell: (d) => <ActiveBadge active={d.isActive} /> },
    { id: "actions", header: "", cardLabel: "Actions", align: "right", cell: rows.cell },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(d) => d.id}
        filters={
          <>
            <SearchFilter list={list} placeholder="Search name or code" />
            <FilterSelect label="Scopes" value={list.filters.scope} options={DISCOUNT_SCOPES} format={humanize} onChange={(v) => list.setFilter("scope", v)} />
            <FilterSelect
              label="Statuses"
              value={list.filters.isActive}
              options={["true", "false"]}
              format={(v) => (v === "true" ? "Active" : "Inactive")}
              onChange={(v) => list.setFilter("isActive", v)}
            />
            <ClearFilters list={list} />
            <Button className="sm:ml-auto" onClick={rows.openNew}>
              <PlusIcon /> New discount
            </Button>
          </>
        }
        empty={<EmptyState icon={PercentIcon} title="No discounts" description="Discount rules apply automatically on invoices." />}
      />
      <DiscountFormDialog open={rows.formOpen} onOpenChange={rows.closeForm} discount={rows.editing} />
      {rows.confirm("discount", "Discounts already applied to invoices can't be deleted; deactivate them instead.")}
    </>
  );
}
