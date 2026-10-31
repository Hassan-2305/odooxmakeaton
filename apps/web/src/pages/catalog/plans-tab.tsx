import { createPlanSchema, PLAN_INTERVALS, type CreatePlanInput, type Plan } from "@brightloop/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, RepeatIcon } from "lucide-react";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { CheckField } from "@/components/check-field";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FormDialog } from "@/components/form-dialog";
import { FormField } from "@/components/form-field";
import { ClearFilters, FilterSelect, SearchFilter } from "@/components/list-filters";
import { ScaledInput } from "@/components/scaled-input";
import { ActiveBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useIsAdmin } from "@/lib/auth";
import { INTERVAL_LABELS, planCycle } from "@/lib/catalog";
import { formatDate, formatMoney } from "@/lib/format";
import { applyApiError } from "@/lib/forms";
import { useListQuery, useListState } from "@/lib/list";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";
import { useRowActions } from "./row-actions";

type FormIn = z.input<typeof createPlanSchema>;

const nullDate = { setValueAs: (v: string) => v || null };

const defaults = (p?: Plan): FormIn => ({
  name: p?.name ?? "",
  pricePaise: p?.pricePaise ?? 0,
  interval: p?.interval ?? "month",
  intervalCount: p?.intervalCount ?? 1,
  minQuantity: p?.minQuantity ?? 1,
  availableFrom: p?.availableFrom ?? null,
  availableTo: p?.availableTo ?? null,
  autoCloseOnEnd: p?.autoCloseOnEnd ?? false,
  closableEarly: p?.closableEarly ?? true,
  pausable: p?.pausable ?? false,
  renewable: p?.renewable ?? true,
  isActive: p?.isActive ?? true,
});

function PlanFormDialog({ open, onOpenChange, plan }: { open: boolean; onOpenChange: (o: boolean) => void; plan?: Plan }) {
  const save = useApiMutation(
    (input: CreatePlanInput) =>
      plan
        ? api<{ plan: Plan }>(`/api/plans/${plan.id}`, { method: "PATCH", body: input })
        : api<{ plan: Plan }>("/api/plans", { method: "POST", body: input }),
    ["plans", "subscriptions"],
  );
  const form = useForm<FormIn, unknown, CreatePlanInput>({ resolver: zodResolver(createPlanSchema), defaultValues: defaults(plan) });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(defaults(plan));
  }, [open, plan, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { plan: saved } = await save.mutateAsync(values);
      toast.success(plan ? "Plan updated" : "Plan created", saved.name);
      onOpenChange(false);
    } catch (error) {
      applyApiError(error, form.setError, [
        "name",
        "pricePaise",
        "interval",
        "intervalCount",
        "minQuantity",
        "availableFrom",
        "availableTo",
      ]);
    }
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? "Edit plan" : "New recurring plan"}
      onSubmit={onSubmit}
      submitting={isSubmitting}
      submitLabel={plan ? "Save changes" : "Create plan"}
      error={errors.root?.server?.message}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" error={errors.name} className="sm:col-span-2">
          <Input autoFocus {...form.register("name")} />
        </FormField>
        <Controller
          control={form.control}
          name="pricePaise"
          render={({ field }) => (
            <FormField label="Price per period" error={errors.pricePaise}>
              <ScaledInput unit="rupees" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            </FormField>
          )}
        />
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <FormField label="Every" error={errors.intervalCount}>
            <Input type="number" min={1} max={36} {...form.register("intervalCount", { valueAsNumber: true })} />
          </FormField>
          <FormField label="Interval" error={errors.interval as never}>
            <Select {...form.register("interval")}>
              {PLAN_INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {INTERVAL_LABELS[i].adverb}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label="Minimum quantity" error={errors.minQuantity}>
          <Input type="number" min={1} {...form.register("minQuantity", { valueAsNumber: true })} />
        </FormField>
        <div />
        <FormField label="Available from (optional)" error={errors.availableFrom}>
          <Input type="date" {...form.register("availableFrom", nullDate)} />
        </FormField>
        <FormField label="Available to (optional)" error={errors.availableTo}>
          <Input type="date" {...form.register("availableTo", nullDate)} />
        </FormField>
      </div>
      <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
        <CheckField label="Auto-close at end of term" hint="Billing closes it once the expiry date passes." {...form.register("autoCloseOnEnd")} />
        <CheckField label="Closable early" hint="Can be closed before its expiry date." {...form.register("closableEarly")} />
        <CheckField label="Pausable" hint="Can be paused and resumed." {...form.register("pausable")} />
        <CheckField label="Renewable" hint="Expiry date can be extended." {...form.register("renewable")} />
        <CheckField label="Active" hint="Inactive plans can't be sold." {...form.register("isActive")} />
      </div>
    </FormDialog>
  );
}

const flag = (on: boolean, label: string) => (on ? <StatusBadge key={label} status="active" label={label} /> : null);

export function PlansTab() {
  const isAdmin = useIsAdmin();
  const list = useListState({ sort: "name", exclude: ["tab"] });
  const query = useListQuery<Plan>("plans", "/api/plans", list);
  const rows = useRowActions<Plan>("/api/plans", ["plans"]);

  const columns: DataTableColumn<Plan>[] = [
    { id: "name", header: "Plan", sortField: "name", cell: (p) => <span className="font-medium">{p.name}</span> },
    {
      id: "price",
      header: "Price",
      sortField: "pricePaise",
      align: "right",
      className: "tabular-nums whitespace-nowrap",
      cell: (p) => formatMoney(p.pricePaise),
    },
    { id: "cycle", header: "Billing", cell: (p) => planCycle(p) },
    { id: "min", header: "Min qty", align: "right", cell: (p) => p.minQuantity },
    {
      id: "available",
      header: "Available",
      className: "whitespace-nowrap text-muted-foreground",
      cell: (p) => (p.availableFrom || p.availableTo ? `${formatDate(p.availableFrom)} – ${formatDate(p.availableTo)}` : "Always"),
    },
    {
      id: "rules",
      header: "Rules",
      cell: (p) => (
        <span className="flex flex-wrap justify-end gap-1 sm:justify-start">
          {[flag(p.pausable, "Pausable"), flag(p.renewable, "Renewable"), flag(p.closableEarly, "Close early"), flag(p.autoCloseOnEnd, "Auto-close")]}
        </span>
      ),
    },
    { id: "active", header: "Status", cell: (p) => <ActiveBadge active={p.isActive} /> },
    ...(isAdmin ? [{ id: "actions", header: "", cardLabel: "Actions", align: "right" as const, cell: rows.cell }] : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(p) => p.id}
        filters={
          <>
            <SearchFilter list={list} placeholder="Search plans" />
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
                <PlusIcon /> New plan
              </Button>
            )}
          </>
        }
        empty={<EmptyState icon={RepeatIcon} title="No plans" description="Plans set the price and billing interval." />}
      />
      {isAdmin && (
        <>
          <PlanFormDialog open={rows.formOpen} onOpenChange={rows.closeForm} plan={rows.editing} />
          {rows.confirm("plan", "Plans used by subscriptions or templates can't be deleted; deactivate them instead.")}
        </>
      )}
    </>
  );
}
