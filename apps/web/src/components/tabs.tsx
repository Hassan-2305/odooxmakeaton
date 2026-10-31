import { cn } from "@/lib/utils";

interface TabsProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  tabs: readonly { value: V; label: string }[];
  className?: string;
}

/** Underlined tab row. The panel is whatever the page renders for `value`. */
export function Tabs<V extends string>({ value, onChange, tabs, className }: TabsProps<V>) {
  return (
    <div role="tablist" className={cn("mb-4 flex gap-1 overflow-x-auto border-b", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            t.value === value
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
