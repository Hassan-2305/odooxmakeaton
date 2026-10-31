import type { Customer, ListResponse } from "@brightloop/shared";
import { useQuery } from "@tanstack/react-query";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CustomerSelectProps {
  value: string | undefined;
  onChange: (customerId: string | undefined) => void;
  className?: string;
}

/** "All customers" or one customer, for report and list filters (first 100 by name). */
export function CustomerSelect({ value, onChange, className }: CustomerSelectProps) {
  const customers = useQuery({
    queryKey: ["customers", "options"],
    queryFn: ({ signal }) =>
      api<ListResponse<Customer>>("/api/customers", { params: { pageSize: 100, sort: "name" }, signal }),
    staleTime: 5 * 60_000,
  });

  return (
    <Select
      aria-label="Customer"
      className={cn("w-56", className)}
      value={value ?? ""}
      disabled={customers.isPending}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{customers.isError ? "All customers (list unavailable)" : "All customers"}</option>
      {customers.data?.data.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}
