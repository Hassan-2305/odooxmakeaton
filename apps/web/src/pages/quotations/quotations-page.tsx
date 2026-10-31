import type { QuotationTemplate } from "@brightloop/shared";
import { FileTextIcon, PencilIcon, PlusIcon, RepeatIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ClearFilters, FilterSelect, SearchFilter } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import { ActiveBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useIsAdmin } from "@/lib/auth";
import { usePlanOptions } from "@/lib/catalog";
import { useListQuery, useListState } from "@/lib/list";
import { useApiMutation } from "@/lib/resources";
import { toast } from "@/lib/toast";
import { FromTemplateDialog } from "./from-template-dialog";
import { TemplateFormDialog } from "./template-form-dialog";

/** Quotation templates; anyone in the back office can quote from one, admins edit them. */
export function QuotationsPage() {
  const isAdmin = useIsAdmin();
  const list = useListState({ sort: "name" });
  const query = useListQuery<QuotationTemplate>("templates", "/api/quotation-templates", list);
  const plans = usePlanOptions();
  const [editing, setEditing] = useState<QuotationTemplate | "new" | null>(null);
  const [deleting, setDeleting] = useState<QuotationTemplate | null>(null);
  const [quoting, setQuoting] = useState<QuotationTemplate | null>(null);
  const remove = useApiMutation((id: string) => api(`/api/quotation-templates/${id}`, { method: "DELETE" }), ["templates"]);
  const planName = (id: string | null) =>
    id ? (plans.data?.data.find((p) => p.id === id)?.name ?? "…") : <span className="text-muted-foreground">Chosen per quote</span>;

  const columns: DataTableColumn<QuotationTemplate>[] = [
    { id: "name", header: "Template", sortField: "name", cell: (t) => <span className="font-medium">{t.name}</span> },
    { id: "plan", header: "Plan", cell: (t) => planName(t.recurringPlanId) },
    {
      id: "lines",
      header: "Lines",
      cell: (t) => (
        <span className="text-muted-foreground">
          {t.lines.map((l) => `${l.quantity} × ${l.variantName ?? l.productName}`).join(", ")}
        </span>
      ),
    },
    { id: "validity", header: "Valid for", sortField: "validityDays", align: "right", cell: (t) => `${t.validityDays} days` },
    { id: "active", header: "Status", cell: (t) => <ActiveBadge active={t.isActive} /> },
    {
      id: "actions",
      header: "",
      cardLabel: "Actions",
      align: "right",
      cell: (t) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="xs" variant="outline" onClick={() => setQuoting(t)} disabled={!t.isActive}>
            <RepeatIcon /> Create subscription
          </Button>
          {isAdmin && (
            <>
              <Button size="icon-xs" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                <PencilIcon />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                <Trash2Icon />
              </Button>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Reusable quotation templates. Create a subscription from one to send a quote."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing("new")}>
              <PlusIcon /> New template
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(t) => t.id}
        filters={
          <>
            <SearchFilter list={list} placeholder="Search templates" />
            <FilterSelect
              label="Statuses"
              value={list.filters.isActive}
              options={["true", "false"]}
              format={(v) => (v === "true" ? "Active" : "Inactive")}
              onChange={(v) => list.setFilter("isActive", v)}
            />
            <ClearFilters list={list} />
          </>
        }
        empty={
          <EmptyState
            icon={FileTextIcon}
            title={Object.keys(list.filters).length ? "No matching templates" : "No quotation templates"}
            description={isAdmin ? "Create a template with the products you usually quote." : undefined}
          />
        }
      />
      {isAdmin && (
        <>
          <TemplateFormDialog
            open={editing !== null}
            onOpenChange={(o) => !o && setEditing(null)}
            template={editing === "new" || editing === null ? undefined : editing}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(o) => !o && setDeleting(null)}
            destructive
            title={`Delete ${deleting?.name ?? "template"}?`}
            description="Subscriptions already created from it are not affected."
            confirmLabel="Delete template"
            onConfirm={async () => {
              if (!deleting) return;
              await remove.mutateAsync(deleting.id);
              toast.success("Template deleted", deleting.name);
            }}
          />
        </>
      )}
      <FromTemplateDialog template={quoting} onOpenChange={(o) => !o && setQuoting(null)} />
    </>
  );
}
