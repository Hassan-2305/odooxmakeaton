import type { IntegrityFinding, IntegrityFindingEvent } from "@brightloop/shared";
import { CheckCircle2Icon, XIcon, XCircleIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ErrorState } from "@/components/error-state";
import { GlossaryTip } from "@/components/glossary-tip";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { useRequiredUser } from "@/lib/auth";
import { formatDate, formatDateTime, formatMoney, humanize } from "@/lib/format";
import { RULE_INFO, ruleLabel, useFinding } from "@/lib/integrity";
import { cn } from "@/lib/utils";
import { DismissFindingDialog, ResolveFindingDialog } from "./finding-action-dialogs";

/** Back-office route for an entity referenced by a finding. */
const ENTITY_ROUTES: Record<string, string> = {
  subscription: "/subscriptions",
  invoice: "/invoices",
  payment: "/payments",
  customer: "/customers",
};
const ID_KEY_ROUTES: Record<string, string> = {
  subscriptionId: "/subscriptions",
  originalInvoiceId: "/invoices",
  invoiceId: "/invoices",
  paymentId: "/payments",
  customerId: "/customers",
};

/** "invoiceForPeriodStart" → "Invoice for period start"; drops a trailing "Paise". */
function labelFor(key: string) {
  return humanize(key.replace(/Paise$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase());
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function FieldValue({ name, value }: { name: string; value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">None</span>;
  if (typeof value === "number" && name.endsWith("Paise")) return <span className="tabular-nums">{formatMoney(value)}</span>;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return <>{formatDate(value.slice(0, 10))}</>;
  if (typeof value === "string" && UUID.test(value)) {
    const base = ID_KEY_ROUTES[name];
    const short = <span className="font-mono text-xs">{value.slice(0, 8)}</span>;
    return base ? (
      <Link to={`${base}/${value}`} className="text-primary hover:underline">
        {short}
      </Link>
    ) : (
      short
    );
  }
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <FieldValue key={i} name={name.replace(/Ids$/, "Id")} value={v} />
        ))}
      </span>
    );
  }
  if (typeof value === "object") return <code className="text-xs break-all">{JSON.stringify(value)}</code>;
  return <>{String(value)}</>;
}

function KeyValues({ data, highlight }: { data: unknown; highlight?: Set<string> }) {
  if (data === null || typeof data !== "object") {
    return <p className="text-sm">{data === null || data === undefined ? "None" : String(data)}</p>;
  }
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">None</p>;
  return (
    <dl className="grid gap-2 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className={cn("grid gap-0.5", highlight?.has(key) && "font-medium")}>
          <dt className="text-xs text-muted-foreground">{labelFor(key)}</dt>
          <dd>
            <FieldValue name={key} value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Keys whose value differs between expected and actual. */
function differingKeys(expected: unknown, actual: unknown): Set<string> {
  const out = new Set<string>();
  if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    for (const key of new Set([...Object.keys(e), ...Object.keys(a)])) {
      if (JSON.stringify(e[key]) !== JSON.stringify(a[key])) out.add(key);
    }
  }
  return out;
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Timeline({ events }: { events: IntegrityFindingEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No status changes yet.</p>;
  return (
    <ol className="relative space-y-4 border-l pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full border-2 border-background bg-primary" />
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {e.fromStatus ? (
              <>
                <StatusBadge status={e.fromStatus} />
                <span className="text-muted-foreground">→</span>
              </>
            ) : (
              <span className="text-muted-foreground">Detected as</span>
            )}
            <StatusBadge status={e.toStatus} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {e.actor?.name ?? "System"} · {formatDateTime(e.createdAt)}
          </p>
          {e.note && <p className="mt-1 rounded-md bg-surface px-2.5 py-1.5 text-sm whitespace-pre-wrap">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}

function DrawerBody({ finding, events }: { finding: IntegrityFinding; events: IntegrityFindingEvent[] }) {
  const user = useRequiredUser();
  const [dialog, setDialog] = useState<"dismiss" | "resolve" | null>(null);
  const actionable = finding.status === "open" || finding.status === "confirmed";
  const info = RULE_INFO[finding.rule as keyof typeof RULE_INFO];
  const entityBase = ENTITY_ROUTES[finding.entityType];
  const diff = differingKeys(finding.expected, finding.actual);

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={finding.status} />
          <StatusBadge status={finding.severity} label={`${humanize(finding.severity)} severity`} />
          <span className="text-xs text-muted-foreground">Detected {formatDateTime(finding.detectedAt)}</span>
        </div>
        {info && <p className="text-sm text-muted-foreground">{info.description}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card-surface p-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Estimated impact
              <GlossaryTip term="Estimated impact">
                Money at stake as calculated by the scanner: the unbilled period, the duplicate total, or the
                unallocated amount.
              </GlossaryTip>
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(finding.impactPaise)}</p>
          </div>
          <div className="card-surface p-3">
            <p className="text-xs text-muted-foreground">Confirmed impact</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {finding.confirmedImpactPaise === null ? (
                <span className="text-muted-foreground">Not confirmed</span>
              ) : (
                formatMoney(finding.confirmedImpactPaise)
              )}
            </p>
          </div>
        </div>

        <Section
          title="Expected vs actual"
          aside={<GlossaryTip term="Expected vs actual">What the records should show, next to what they show now. Differences are in bold.</GlossaryTip>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-status-paid/30 bg-status-paid-bg/40 p-3">
              <p className="mb-2 text-xs font-medium text-status-paid-fg">Expected</p>
              <KeyValues data={finding.expected} highlight={diff} />
            </div>
            <div className="rounded-lg border border-status-overdue/30 bg-status-overdue-bg/40 p-3">
              <p className="mb-2 text-xs font-medium text-status-overdue-fg">Actual</p>
              <KeyValues data={finding.actual} highlight={diff} />
            </div>
          </div>
        </Section>

        <Section title="Evidence">
          <div className="rounded-lg border p-3">
            <dl className="mb-3 grid gap-0.5 border-b pb-3 text-sm">
              <dt className="text-xs text-muted-foreground">Affected record</dt>
              <dd>
                {humanize(finding.entityType)}{" "}
                {entityBase ? (
                  <Link to={`${entityBase}/${finding.entityId}`} className="font-mono text-xs text-primary hover:underline">
                    {finding.entityId.slice(0, 8)}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{finding.entityId.slice(0, 8)}</span>
                )}
                {finding.customerId && (
                  <>
                    {" · "}
                    <Link to={`/customers/${finding.customerId}`} className="text-primary hover:underline">
                      View customer
                    </Link>
                  </>
                )}
              </dd>
            </dl>
            <KeyValues data={finding.evidence} />
          </div>
        </Section>

        <Section title="Timeline">
          <Timeline events={events} />
        </Section>
      </div>

      {actionable && (
        <footer className="flex flex-wrap justify-end gap-2 border-t bg-surface px-5 py-3">
          <Button variant="outline" onClick={() => setDialog("dismiss")}>
            <XCircleIcon /> Dismiss
          </Button>
          {user.role === "admin" && (
            <Button onClick={() => setDialog("resolve")}>
              <CheckCircle2Icon /> Resolve
            </Button>
          )}
        </footer>
      )}

      <DismissFindingDialog finding={finding} open={dialog === "dismiss"} onOpenChange={(o) => setDialog(o ? "dismiss" : null)} />
      {user.role === "admin" && (
        <ResolveFindingDialog finding={finding} open={dialog === "resolve"} onOpenChange={(o) => setDialog(o ? "resolve" : null)} />
      )}
    </>
  );
}

/** Right-hand drawer with everything about one finding, opened from the findings table. */
export function FindingDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useFinding(id);
  const finding = query.data?.finding;

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right">
        <header className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <DialogTitle className="text-base">{finding ? ruleLabel(finding.rule) : "Finding"}</DialogTitle>
            <DialogDescription className="mt-1 font-mono text-xs">{id?.slice(0, 8)}</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close">
              <XIcon />
            </Button>
          </DialogClose>
        </header>
        {query.isPending ? (
          <div className="space-y-4 px-5 py-5" role="status" aria-label="Loading finding">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DrawerBody finding={query.data.finding} events={query.data.events} />
        )}
      </SheetContent>
    </Dialog>
  );
}
