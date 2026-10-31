import { useSearchParams } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Tabs } from "@/components/tabs";
import { useIsAdmin } from "@/lib/auth";
import { DiscountsTab } from "./discounts-tab";
import { PlansTab } from "./plans-tab";
import { ProductsTab } from "./products-tab";
import { TaxesTab } from "./taxes-tab";

type Tab = "products" | "plans" | "taxes" | "discounts";

const ALL_TABS: { value: Tab; label: string; adminOnly?: boolean }[] = [
  { value: "products", label: "Products" },
  { value: "plans", label: "Plans" },
  { value: "taxes", label: "Taxes" },
  // GET /api/discounts is admin-only, so staff don't get the tab.
  { value: "discounts", label: "Discounts", adminOnly: true },
];

/** Catalog: products (with attributes and variants), recurring plans, taxes and discount rules. */
export function ProductsPage() {
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const tabs = ALL_TABS.filter((t) => isAdmin || !t.adminOnly);
  const requested = params.get("tab") as Tab | null;
  const tab = tabs.find((t) => t.value === requested)?.value ?? "products";

  // Each tab has its own list state in the URL; switching starts it fresh.
  const select = (next: Tab) => setParams(next === "products" ? {} : { tab: next }, { replace: true });

  return (
    <>
      <PageHeader
        title="Products & Plans"
        description={
          isAdmin
            ? "What you sell, how often it bills, the taxes that apply and the discounts on offer."
            : "What you sell, how often it bills and the taxes that apply. Only admins can make changes."
        }
      />
      <Tabs value={tab} onChange={select} tabs={tabs} />
      {tab === "products" && <ProductsTab />}
      {tab === "plans" && <PlansTab />}
      {tab === "taxes" && <TaxesTab />}
      {tab === "discounts" && isAdmin && <DiscountsTab />}
    </>
  );
}
