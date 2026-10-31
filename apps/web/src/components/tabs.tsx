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
    <div role="tablist" className={cn("mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-white/80 p-1 shadow-xs backdrop-blur", className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            t.value === value
              ? "bg-gradient-to-b from-orange-500 to-orange-600 text-white shadow-sm shadow-orange-600/25"
              : "text-muted-foreground hover:bg-surface hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
