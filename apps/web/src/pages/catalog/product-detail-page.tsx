import type { Attribute, AttributeValue, Product, Tax, Variant } from "@brightloop/shared";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BackLink, DetailCard, DetailList, DetailSkeleton, SimpleTable } from "@/components/detail";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { ActiveBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTaxOptions } from "@/lib/catalog";
import { useIsAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { formatBps } from "@/lib/money-input";
import { useApiMutation, useOptions, useRecord } from "@/lib/resources";
import { toast } from "@/lib/toast";
import { AttributeDialog, AttributeValueDialog, VariantDialog } from "./attribute-dialogs";
import { ProductFormDialog } from "./product-form-dialog";

type Pending =
  | { kind: "attribute"; attribute: Attribute }
  | { kind: "value"; attribute: Attribute; value: AttributeValue }
  | { kind: "variant"; variant: Variant }
  | { kind: "product" };

function AttributesCard({ productId, attributes, isAdmin }: { productId: string; attributes: Attribute[]; isAdmin: boolean }) {
  const [adding, setAdding] = useState(false);
  const [valueDialog, setValueDialog] = useState<{ attribute: Attribute; value?: AttributeValue } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const remove = useApiMutation((path: string) => api(path, { method: "DELETE" }), ["attributes", "variants", "products"]);

  const confirmRemove = async () => {
    if (pending?.kind === "attribute") {
      await remove.mutateAsync(`/api/products/${productId}/attributes/${pending.attribute.id}`);
      toast.success("Attribute removed", pending.attribute.name);
    } else if (pending?.kind === "value") {
      await remove.mutateAsync(`/api/products/${productId}/attributes/${pending.attribute.id}/values/${pending.value.id}`);
      toast.success("Value removed", pending.value.value);
    }
  };

  return (
    <DetailCard
      title="Attributes"
      actions={
        isAdmin && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <PlusIcon /> Add attribute
          </Button>
        )
      }
    >
      {attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attributes. Add one (e.g. Brand) to create priced variants.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {attributes.map((a) => (
            <div key={a.id} className="overflow-hidden rounded-xl border bg-white">
              <div className="flex items-center justify-between gap-2 border-b bg-surface px-3 py-2">
                <p className="font-medium">
                  {a.name}
                  {a.productId === null && <span className="ml-2 text-xs font-normal text-muted-foreground">Global</span>}
                </p>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setValueDialog({ attribute: a })}>
                      <PlusIcon /> Value
                    </Button>
                    {a.productId !== null && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${a.name}`}
                        onClick={() => setPending({ kind: "attribute", attribute: a })}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <ul className="divide-y text-sm">
                {a.values.length === 0 && <li className="px-3 py-2 text-muted-foreground">No values</li>}
                {a.values.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>{v.value}</span>
                    <span className="flex items-center gap-1">
                      <span className="text-muted-foreground tabular-nums">+{formatMoney(v.priceExtraPaise)}</span>
                      {isAdmin && (
                        <>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Edit ${v.value}`}
                            onClick={() => setValueDialog({ attribute: a, value: v })}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={`Remove ${v.value}`}
                            onClick={() => setPending({ kind: "value", attribute: a, value: v })}
                          >
                            <Trash2Icon />
                          </Button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {isAdmin && (
        <>
          <AttributeDialog open={adding} onOpenChange={setAdding} productId={productId} />
          {valueDialog && (
            <AttributeValueDialog
              open
              onOpenChange={(o) => !o && setValueDialog(null)}
              productId={productId}
              attribute={valueDialog.attribute}
              value={valueDialog.value}
            />
          )}
          <ConfirmDialog
            open={pending?.kind === "attribute" || pending?.kind === "value"}
            onOpenChange={(o) => !o && setPending(null)}
            destructive
            title={
              pending?.kind === "attribute"
                ? `Remove the ${pending.attribute.name} attribute?`
                : pending?.kind === "value"
                  ? `Remove ${pending.value.value}?`
                  : ""
            }
            description="Values used by a variant can't be removed; take them off the variant first."
            confirmLabel="Remove"
            onConfirm={confirmRemove}
          />
        </>
      )}
    </DetailCard>
  );
}

/** Product: details, attribute/value editor and variants priced by the server. */
export function ProductDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const product = useRecord<Product>("products", `/api/products/${id}`, "product");
  const attributes = useQuery({
    queryKey: ["attributes", id],
    queryFn: ({ signal }) => api<{ data: Attribute[] }>(`/api/products/${id}/attributes`, { signal }),
  });
  const variants = useOptions<Variant>("variants", "/api/variants", { productId: id, sort: "name" });
  const taxes = useTaxOptions();
  const [editing, setEditing] = useState(false);
  const [newVariant, setNewVariant] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const remove = useApiMutation((path: string) => api(path, { method: "DELETE" }), ["variants", "products"]);

  if (product.isPending) return <DetailSkeleton />;
  if (product.isError)
    return (
      <>
        <BackLink to="/products">Products & Plans</BackLink>
        <ErrorState error={product.error} onRetry={() => void product.refetch()} />
      </>
    );

  const p = product.data;
  const taxById = new Map((taxes.data?.data ?? []).map((t: Tax) => [t.id, t]));

  return (
    <>
      <BackLink to="/products">Products & Plans</BackLink>
      <PageHeader
        title={p.name}
        description={p.sku ? `SKU ${p.sku}` : undefined}
        actions={
          isAdmin && (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon /> Edit
              </Button>
              <Button variant="outline" onClick={() => setPending({ kind: "product" })}>
                <Trash2Icon /> Delete
              </Button>
            </>
          )
        }
      />
      <div className="space-y-4">
        <DetailCard title="Details">
          <DetailList
            items={[
              ["Sales price", <span className="tabular-nums">{formatMoney(p.basePricePaise)}</span>],
              ["Status", <ActiveBadge active={p.isActive} />],
              [
                "Default taxes",
                p.taxIds.length
                  ? p.taxIds
                      .map((t) => {
                        const tax = taxById.get(t);
                        return tax ? `${tax.name} (${formatBps(tax.rateBps)})` : "…";
                      })
                      .join(", ")
                  : "None",
              ],
              ["Notes", p.description && <span className="whitespace-pre-line">{p.description}</span>],
            ]}
          />
        </DetailCard>

        {attributes.isError ? (
          <ErrorState error={attributes.error} onRetry={() => void attributes.refetch()} />
        ) : attributes.isPending ? (
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        ) : (
          <AttributesCard productId={id} attributes={attributes.data.data} isAdmin={isAdmin} />
        )}

        <DetailCard
          title="Variants"
          actions={
            isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setNewVariant(true)} disabled={!attributes.data?.data.length}>
                <PlusIcon /> New variant
              </Button>
            )
          }
        >
          {variants.isError ? (
            <ErrorState error={variants.error} onRetry={() => void variants.refetch()} />
          ) : variants.isPending ? (
            <div className="h-20 animate-pulse rounded bg-muted" />
          ) : (
            <SimpleTable
              empty="No variants yet."
              head={[
                { label: "Variant" },
                { label: "Attributes" },
                { label: "Status" },
                { label: "Price", align: "right" },
                ...(isAdmin ? [{ label: <span className="sr-only">Actions</span>, align: "right" as const }] : []),
              ]}
              rows={variants.data.data.map((v) => ({
                key: v.id,
                cells: [
                  <span className="font-medium">{v.name}</span>,
                  <span className="text-muted-foreground">
                    {v.attributeValues.map((av) => `${av.attributeName}: ${av.value}`).join(" · ") || "—"}
                  </span>,
                  <ActiveBadge active={v.isActive} />,
                  formatMoney(v.pricePaise),
                  ...(isAdmin
                    ? [
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Delete ${v.name}`}
                          onClick={() => setPending({ kind: "variant", variant: v })}
                        >
                          <Trash2Icon />
                        </Button>,
                      ]
                    : []),
                ],
              }))}
            />
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Prices are computed by the server: sales price plus the price extras of the variant's values.
          </p>
        </DetailCard>
      </div>

      {isAdmin && (
        <>
          <ProductFormDialog open={editing} onOpenChange={setEditing} product={p} />
          <VariantDialog
            open={newVariant}
            onOpenChange={setNewVariant}
            productId={id}
            attributes={attributes.data?.data ?? []}
          />
          <ConfirmDialog
            open={pending !== null}
            onOpenChange={(o) => !o && setPending(null)}
            destructive
            title={pending?.kind === "variant" ? `Delete ${pending.variant.name}?` : `Delete ${p.name}?`}
            description={
              pending?.kind === "variant"
                ? "Variants used on subscriptions or invoices can't be deleted; deactivate them instead."
                : "Products used on subscriptions, templates or invoices can't be deleted; deactivate them instead."
            }
            confirmLabel="Delete"
            onConfirm={async () => {
              if (pending?.kind === "variant") {
                await remove.mutateAsync(`/api/variants/${pending.variant.id}`);
                toast.success("Variant deleted", pending.variant.name);
              } else {
                await remove.mutateAsync(`/api/products/${id}`);
                toast.success("Product deleted", p.name);
                navigate("/products");
              }
            }}
          />
        </>
      )}
    </>
  );
}
