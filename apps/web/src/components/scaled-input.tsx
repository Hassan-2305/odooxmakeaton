import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { formatScaled, parseScaled } from "@/lib/money-input";
import { cn } from "@/lib/utils";

type ScaledInputProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  /** Integer hundredths: paise for rupees, basis points for percent. NaN while the text is invalid. */
  value: number | null | undefined;
  onChange: (value: number) => void;
  unit: "rupees" | "percent";
};

/** Rupee or percent field that hands the form an integer (paise / basis points). */
export function ScaledInput({ value, onChange, unit, className, onBlur, ...props }: ScaledInputProps) {
  const [text, setText] = useState(() => formatScaled(value));
  const [seen, setSeen] = useState(value);

  // Follow outside changes (form reset) without clobbering what the user is typing.
  if (!Object.is(seen, value)) {
    setSeen(value);
    if (!Object.is(parseScaled(text), value)) setText(formatScaled(value));
  }

  return (
    <div className={cn("relative", className)}>
      {unit === "rupees" && (
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
          ₹
        </span>
      )}
      <Input
        {...props}
        inputMode="decimal"
        autoComplete="off"
        className={cn("tabular-nums", unit === "rupees" ? "pl-7" : "pr-7")}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseScaled(e.target.value));
        }}
        onBlur={(e) => {
          const parsed = parseScaled(text);
          if (!Number.isNaN(parsed)) setText(formatScaled(parsed));
          onBlur?.(e);
        }}
      />
      {unit === "percent" && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      )}
    </div>
  );
}
