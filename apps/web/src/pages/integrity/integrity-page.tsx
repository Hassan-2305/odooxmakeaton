import {
  FINDING_RULES,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  type IntegrityFinding,
} from "@brightloop/shared";
import { RadarIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { GlossaryTip } from "@/components/glossary-tip";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { errorMessage } from "@/lib/api";
import { formatCount, formatDateTime, formatMoney, humanize } from "@/lib/format";
import { RULE_INFO, ruleLabel, useScan } from "@/lib/integrity";
import { useListQuery, useListState } from "@/lib/list";
import { toast } from "@/lib/toast";
import { FindingDrawer } from "./finding-drawer";

const columns: DataTableColumn<IntegrityFinding>[] = [
  {
    id: "rule",
    header: "Rule",
    cell: (f) => <span className="font-medium">{ruleLabel(f.rule)}</span>,
  },
  {
    id: "severity",
    header: "Severity",
    sortField: "severity",
    cell: (f) => <StatusBadge status={f.severity} tone={f.severity === "low" ? "draft" : f.severity === "medium" ? "due-soon" : "overdue"} />,
  },
  { id: "status", header: "Status", cell: (f) => <StatusBadge status={f.status} /> },
  {
    id: "entity",
    header: "Record",
    cell: (f) => (
      <span className="text-muted-foreground">
        {humanize(f.entityType)} <span className="font-mono text-xs">{f.entityId.slice(0, 8)}</span>
      </span>
    ),
  },
  {
    id: "impact",
    cardLabel: "Impact",
    header: (
      <span className="inline-flex items-center gap-1">
        Impact
        <GlossaryTip term="Impact">Estimated money at stake, from the scanner. Confirmed impact may differ.</GlossaryTip>
      </span>
    ),
    sortField: "impactPaise",
    align: "right",
    className: "tabular-nums whitespace-nowrap",
    cell: (f) => formatMoney(f.confirmedImpactPaise ?? f.impactPaise),
  },
  {
    id: "detectedAt",
    header: "Detected",
    sortField: "detectedAt",
    className: "whitespace-nowrap",
    cell: (f) => formatDateTime(f.detectedAt),
  },
];

function FilterSelect({
  label,
  value,
  options,
  onChange,
  format = humanize,
}: {
  label: string;
  value: string | undefined;
  options: readonly string[];
  onChange: (value: string | undefined) => void;
  format?: (value: string) => string;
}) {
  return (
    <Select aria-label={label} className="w-44" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">All {label.toLowerCase()}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {format(o)}
        </option>
      ))}
    </Select>
  );
}

/** Revenue integrity: scanner findings with filters, a detail drawer and the review workflow. */
export function IntegrityPage() {
  const list = useListState({ sort: "-detectedAt", pageSize: 20 });
  const query = useListQuery<IntegrityFinding>("findings", "/api/integrity/findings", list);
  const scan = useScan();
  const [selected, setSelected] = useState<string | null>(null);
  const hasFilters = Object.keys(list.filters).length > 0;

  const runScan = () =>
    scan.mutate(undefined, {
      onSuccess: (r) => {
        const parts = [`${formatCount(r.detected)} issue${r.detected === 1 ? "" : "s"} detected`];
        if (r.created) parts.push(`${formatCount(r.created)} new`);
        if (r.reopened) parts.push(`${formatCount(r.reopened)} reopened`);
        if (r.autoResolved) parts.push(`${formatCount(r.autoResolved)} auto-resolved`);
        toast.success("Scan complete", parts.join(" · "));
      },
      onError: (error) => toast.error("Scan failed", errorMessage(error)),
    });

  return (
    <>
      <PageHeader
        title="Revenue integrity"
        description={
          <span className="inline-flex items-center gap-1">
            Billing gaps the scanner found: missing invoices, duplicates and unallocated payments.
            <GlossaryTip term="Revenue integrity">
              {FINDING_RULES.map((r) => (
                <span key={r} className="mb-1 block">
                  <strong>{RULE_INFO[r].label}:</strong> {RULE_INFO[r].description}
                </span>
              ))}
            </GlossaryTip>
          </span>
        }
        actions={
          <Button onClick={runScan} disabled={scan.isPending}>
            <RadarIcon className={scan.isPending ? "animate-pulse" : undefined} />
            {scan.isPending ? "Scanning…" : "Scan now"}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(f) => f.id}
        onRowClick={(f) => setSelected(f.id)}
        empty={
          hasFilters ? (
            <EmptyState title="No matching findings" description="Try changing or clearing the filters." />
          ) : (
            <EmptyState
              icon={ShieldCheckIcon}
              title="No findings"
              description="Nothing has been flagged. Run a scan to check billing now."
              action={
                <Button size="sm" variant="outline" onClick={runScan} disabled={scan.isPending}>
                  Scan now
                </Button>
              }
            />
          )
        }
        filters={
          <>
            <FilterSelect
              label="Rules"
              value={list.filters.rule}
              options={FINDING_RULES}
              format={ruleLabel}
              onChange={(v) => list.setFilter("rule", v)}
            />
            <FilterSelect
              label="Statuses"
              value={list.filters.status}
              options={FINDING_STATUSES}
              onChange={(v) => list.setFilter("status", v)}
            />
            <FilterSelect
              label="Severities"
              value={list.filters.severity}
              options={FINDING_SEVERITIES}
              onChange={(v) => list.setFilter("severity", v)}
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={list.clearFilters}>
                Clear filters
              </Button>
            )}
          </>
        }
      />
      <FindingDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
