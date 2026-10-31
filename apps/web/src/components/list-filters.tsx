import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { humanize } from "@/lib/format";
import type { ListStateApi } from "@/lib/list";
import { cn } from "@/lib/utils";

/** Search box that writes `key` to the list filters 300 ms after typing stops. */
export function SearchFilter({
  list,
  name = "q",
  placeholder = "Search…",
  className,
}: {
  list: ListStateApi;
  name?: string;
  placeholder?: string;
  className?: string;
}) {
  const current = list.filters[name] ?? "";
  const [text, setText] = useState(current);
  const [seen, setSeen] = useState(current);

  // The URL changed from outside (Clear filters, back button): show it.
  if (seen !== current) {
    setSeen(current);
    setText(current);
  }

  useEffect(() => {
    if (text.trim() === current) return;
    const t = setTimeout(() => list.setFilter(name, text.trim() || undefined), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [text]);

  return (
    <div className={cn("relative w-64", className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        className="pl-9"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

/** "All …" or one value, for enum filters. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  format = humanize,
  className,
}: {
  label: string;
  value: string | undefined;
  options: readonly string[];
  onChange: (value: string | undefined) => void;
  format?: (value: string) => string;
  className?: string;
}) {
  return (
    <Select
      aria-label={label}
      className={cn("w-44", className)}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">All {label.toLowerCase()}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {format(o)}
        </option>
      ))}
    </Select>
  );
}

/** Labelled date input for list filters. */
export function DateFilter({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  min?: string;
  max?: string;
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type="date"
        className="w-40 max-sm:w-full"
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </label>
  );
}

export function ClearFilters({ list, keep = [] }: { list: ListStateApi; keep?: readonly string[] }) {
  const active = Object.keys(list.filters).filter((k) => !keep.includes(k));
  if (active.length === 0) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => list.setFilters(Object.fromEntries(active.map((k) => [k, undefined])))}
    >
      Clear filters
    </Button>
  );
}
