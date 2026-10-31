import { ConstructionIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

/** Stand-in for screens that are routed and guarded but not built yet. */
export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="card-surface">
        <EmptyState icon={ConstructionIcon} title="Coming soon" description={`The ${title} screen is on its way.`} />
      </div>
    </>
  );
}
