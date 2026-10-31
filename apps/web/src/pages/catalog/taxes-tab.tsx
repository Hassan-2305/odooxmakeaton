import { createTaxSchema, type CreateTaxInput, type Tax } from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { LandmarkIcon, PlusIcon } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { CheckField } from "@/components/check-field";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { ClearFilters, FilterSelect } from "@/components/list-filters";
import { ScaledInput } from "@/components/scaled-input";
import { ActiveBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useIsAdmin } from "@/lib/auth";
import { formatDate, todayIso } from "@/lib/format";
import { applyApiError } from "@/lib/forms";
import { useListQuery, useListState } from "@/lib/list";
import { formatBps } from "@/lib/money-input";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";
import { useRowActions } from "./row-actions";

type FormIn = z.input<typeof createTaxSchema>;

const defaults = (t?: Tax): FormIn => ({
  name: t?.name ?? "",
  rateBps: t?.rateBps ?? 1800,
  inclusive: t?.inclusive ?? false,
  effectiveFrom: t?.effectiveFrom ?? todayIso(),
  effectiveTo: t?.effectiveTo ?? null,
  isActive: t?.isActive ?? true,
});

function TaxFormDialog({ open, onOpenChange, tax }: { open: boolean; onOpenChange: (o: boolean) => void; tax?: Tax }) {
  const save = useApiMutation(
    (input: CreateTaxInput) =>
      tax
        ? api<{ tax: Tax }>(`/api/taxes/${tax.id}`, { method: "PATCH", body: input })
        : api<{ tax: Tax }>("/api/taxes", { method: "POST", body: input }),
    ["taxes", "products"],
  );
  const form = useForm<FormIn, unknown, CreateTaxInput>({ resolver: zodResolver(createTaxSchema), defaultValues: defaults(tax) });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(defaults(tax));
  }, [open, tax, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { tax: saved } = await save.mutateAsync(values);
      toast.success(tax ? "Tax updated" : "Tax created", `${saved.name} · ${formatBps(saved.rateBps)}`);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, ["name", "rateBps", "effectiveFrom", "effectiveTo"]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tax ? "Edit tax" : "New tax"}
      description="Invoices snapshot the rate in effect on the invoice date, so past invoices never change."
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel={tax ? "Save changes" : "Create tax"}
      error={errors.root?.server?.message}
    >
      <FormField label="Name" error={errors.name}>
        <Input autoFocus placeholder="e.g. GST 18%" {...form.register("name")} />
      </FormField>
      <Controller
        control={form.control}
        name="rateBps"
        render={({ field }) => (
          <FormField label="Rate" error={errors.rateBps}>
            <ScaledInput unit="percent" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
          </FormField>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Effective from" error={errors.effectiveFrom}>
          <Input type="date" {...form.register("effectiveFrom")} />
        </FormField>
        <FormField label="Effective to (optional)" error={errors.effectiveTo} hint="Last day the rate applies">
          <Input type="date" {...form.register("effectiveTo", { setValueAs: (v: string) => v || null })} />
        </FormField>
      </div>
      <CheckField label="Inclusive" hint="The tax is already included in the price." {...form.register("inclusive")} />
      <CheckField label="Active" {...form.register("isActive")} />
    </FormDialog>
  );
}

export function TaxesTab() {
  const isAdmin = useIsAdmin();
  const list = useListState({ sort: "name", exclude: ["tab"] });
  const query = useListQuery<Tax>("taxes", "/api/taxes", list);
  const rows = useRowActions<Tax>("/api/taxes", ["taxes", "products"]);

  const columns: DataTableColumn<Tax>[] = [
    { id: "name", header: "Tax", sortField: "name", cell: (t) => <span className="font-medium">{t.name}</span> },
    { id: "rate", header: "Rate", sortField: "rateBps", align: "right", className: "tabular-nums", cell: (t) => formatBps(t.rateBps) },
    {
      id: "inclusive",
      header: "Type",
      cell: (t) => <StatusBadge status={t.inclusive ? "confirmed" : "draft"} label={t.inclusive ? "Inclusive" : "Exclusive"} />,
    },
    {
      id: "effective",
      header: "Effective",
      sortField: "effectiveFrom",
      className: "whitespace-nowrap",
      cell: (t) => `${formatDate(t.effectiveFrom)} – ${t.effectiveTo ? formatDate(t.effectiveTo) : "open"}`,
    },
    { id: "active", header: "Status", cell: (t) => <ActiveBadge active={t.isActive} /> },
    ...(isAdmin ? [{ id: "actions", header: "", cardLabel: "Actions", align: "right" as const, cell: rows.cell }] : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(t) => t.id}
        filters={
          <>
            <FilterSelect
              label="Statuses"
              value={list.filters.isActive}
              options={["true", "false"]}
              format={(v) => (v === "true" ? "Active" : "Inactive")}
              onChange={(v) => list.setFilter("isActive", v)}
            />
            <ClearFilters list={list} />
            {isAdmin && (
              <Button className="sm:ml-auto" onClick={rows.openNew}>
                <PlusIcon /> New tax
              </Button>
            )}
          </>
        }
        empty={<EmptyState icon={LandmarkIcon} title="No taxes" description="Add GST rates to apply them to products." />}
      />
      {isAdmin && (
        <>
          <TaxFormDialog open={rows.formOpen} onOpenChange={rows.closeForm} tax={rows.editing} />
          {rows.confirm("tax", "Taxes already used on invoices can't be deleted; end-date or deactivate them instead.")}
        </>
      )}
    </>
  );
}
