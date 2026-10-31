import { InfoIcon } from "lucide-react";
import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";

/** Small "i" next to a metric name that explains how it is calculated. */
export function GlossaryTip({ term, children }: { term: string; children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={`What is ${term}?`}
            className="inline-flex rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            // Tiles are links; the tip must not navigate.
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <InfoIcon className="size-3.5" aria-hidden />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            className="z-50 max-w-64 rounded-md bg-foreground px-3 py-2 text-xs leading-relaxed text-background shadow-md animate-in fade-in-0"
          >
            {children}
            <Tooltip.Arrow className="fill-foreground" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
