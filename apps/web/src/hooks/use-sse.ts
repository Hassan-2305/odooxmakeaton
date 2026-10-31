import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { startLiveUpdates, type LiveStatus } from "@/lib/live-updates";

/**
 * Subscribes to /api/events while mounted and invalidates the affected queries on
 * invoice.created, payment.recorded and billing_run.finished. Falls back to 30s polling
 * when the stream errors. Mount once per signed-in layout.
 */
export function useSSE(enabled = true): LiveStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    if (!enabled) return;
    return startLiveUpdates({
      queryClient,
      onStatus: setStatus,
      shouldSkipPoll: () => document.hidden,
    });
  }, [enabled, queryClient]);

  return status;
}
