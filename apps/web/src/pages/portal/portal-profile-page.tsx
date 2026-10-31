import { MessageSquarePlusIcon } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useRequiredUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { usePortalProfile } from "@/lib/portal";
import { RequestDialog } from "./request-dialog";

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm sm:col-span-2">{value || <span className="text-muted-foreground">Not provided</span>}</dd>
    </div>
  );
}

export function PortalProfilePage() {
  const user = useRequiredUser();
  const profile = usePortalProfile();
  const [requestOpen, setRequestOpen] = useState(false);
  const c = profile.data;

  const address = c
    ? [c.addressLine1, c.addressLine2, [c.city, c.state].filter(Boolean).join(", "), c.postalCode, c.country]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <>
      <PageHeader title="Profile" description="The details we bill against. Contact us to update them." />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border bg-card p-5 lg:col-span-2" aria-label="Billing details">
          <h2 className="mb-2 font-medium">Billing details</h2>
          {profile.isPending ? (
            <div className="space-y-3" role="status" aria-label="Loading profile">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-5 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : profile.isError ? (
            <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
          ) : (
            <dl className="divide-y">
              <Row label="Company / name" value={c!.name} />
              <Row label="Billing email" value={c!.email} />
              <Row label="Phone" value={c!.phone} />
              <Row label="GSTIN" value={c!.gstin} />
              <div className="grid gap-0.5 py-2.5 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm text-muted-foreground">Address</dt>
                <dd className="text-sm whitespace-pre-line sm:col-span-2">
                  {address || <span className="text-muted-foreground">Not provided</span>}
                </dd>
              </div>
              <Row label="Customer since" value={formatDate(c!.createdAt)} />
            </dl>
          )}
        </section>
        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-5" aria-label="Sign-in">
            <h2 className="mb-2 font-medium">Sign-in</h2>
            <dl>
              <Row label="Name" value={user.name} />
              <Row label="Email" value={user.email} />
            </dl>
          </section>
          <section className="rounded-lg border bg-card p-5">
            <h2 className="font-medium">Need something changed?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask to change or cancel a subscription and our team will follow up.
            </p>
            <Button className="mt-3" variant="outline" onClick={() => setRequestOpen(true)}>
              <MessageSquarePlusIcon /> Request a change
            </Button>
          </section>
        </aside>
      </div>
      <RequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
    </>
  );
}
