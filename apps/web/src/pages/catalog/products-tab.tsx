import type { Product } from "@brightloop/shared";
import { BoxesIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ClearFilters, FilterSelect, SearchFilter } from "@/components/list-filters";
import { ActiveBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { useListQuery, useListState } from "@/lib/list";
import { ProductFormDialog } from "./product-form-dialog";

const columns: DataTableColumn<Product>[] = [
  {
    id: "name",
    header: "Product",
    sortField: "name",
    cell: (p) => (
      <Link to={`/products/${p.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
        {p.name}
      </Link>
    ),
  },
  { id: "sku", header: "SKU", cell: (p) => <span className="font-mono text-xs">{p.sku ?? "—"}</span> },
  {
    id: "price",
    header: "Sales price",
    sortField: "basePricePaise",
    align: "right",
    className: "tabular-nums whitespace-nowrap",
    cell: (p) => formatMoney(p.basePricePaise),
  },
  { id: "taxes", header: "Taxes", align: "right", cell: (p) => p.taxIds.length || "—" },
  { id: "active", header: "Status", cell: (p) => <ActiveBadge active={p.isActive} /> },
];

export function ProductsTab() {
  const isAdmin = useIsAdmin();
  const list = useListState({ sort: "name", exclude: ["tab"] });
  const query = useListQuery<Product>("products", "/api/products", list);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DataTable
        columns={columns}
        query={query}
        list={list}
        rowKey={(p) => p.id}
        onRowClick={(p) => navigate(`/products/${p.id}`)}
        filters={
          <>
            <SearchFilter list={list} placeholder="Search products" />
            <FilterSelect
              label="Statuses"
              value={list.filters.isActive}
              options={["true", "false"]}
              format={(v) => (v === "true" ? "Active" : "Inactive")}
              onChange={(v) => list.setFilter("isActive", v)}
            />
            <ClearFilters list={list} />
            {isAdmin && (
              <Button className="sm:ml-auto" onClick={() => setCreating(true)}>
                <PlusIcon /> New product
              </Button>
            )}
          </>
        }
        empty={
          <EmptyState
            icon={BoxesIcon}
            title={Object.keys(list.filters).length ? "No matching products" : "No products yet"}
            description={isAdmin ? "Add a product, then give it attributes and variants." : undefined}
          />
        }
      />
      {isAdmin && (
        <ProductFormDialog open={creating} onOpenChange={setCreating} onSaved={(p) => navigate(`/products/${p.id}`)} />
      )}
    </>
  );
}
