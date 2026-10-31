import { AlertCircleIcon, CheckCircle2Icon, XIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { dismissToast as dismiss, getToasts, subscribeToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** Mount once at the app root. */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((t) => {
        const Icon = t.variant === "success" ? CheckCircle2Icon : AlertCircleIcon;
        return (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className="pointer-events-auto flex items-start gap-3 rounded-lg border bg-popover p-3 text-sm shadow-lg animate-in fade-in-0 slide-in-from-bottom-2"
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                t.variant === "success" ? "text-status-paid" : "text-status-overdue",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.title}</p>
              {t.description && <p className="mt-0.5 text-muted-foreground">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-sm opacity-60 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Dismiss notification"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
