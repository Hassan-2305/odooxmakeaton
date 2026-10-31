import type { QueryClient } from "@tanstack/react-query";

/** Which TanStack query roots each server event makes stale. */
export const EVENT_INVALIDATIONS: Record<string, readonly string[]> = {
  "invoice.created": ["invoices", "reports"],
  "payment.recorded": ["payments", "invoices", "reports"],
  "billing_run.finished": ["runs", "reports"],
};

const ALL_KEYS = [...new Set(Object.values(EVENT_INVALIDATIONS).flat())];

export const POLL_INTERVAL_MS = 30_000;

export type LiveStatus = "connecting" | "live" | "polling";

/** The parts of EventSource we use, so tests can pass a fake. */
export interface EventSourceLike {
  onopen: ((ev: Event) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  close(): void;
}

interface Options {
  queryClient: Pick<QueryClient, "invalidateQueries">;
  url?: string;
  createEventSource?: (url: string) => EventSourceLike;
  onStatus?: (status: LiveStatus) => void;
  pollIntervalMs?: number;
  /** Skip a poll tick, e.g. while the tab is hidden. */
  shouldSkipPoll?: () => boolean;
}

/**
 * Keeps cached queries fresh from GET /api/events. If the stream errors, it closes it and
 * falls back to invalidating every live-updated query every 30s; each tick also retries
 * the stream, and polling stops as soon as it reconnects. Returns a stop function.
 */
export function startLiveUpdates({
  queryClient,
  url = "/api/events",
  createEventSource = (u) => new EventSource(u, { withCredentials: true }),
  onStatus,
  pollIntervalMs = POLL_INTERVAL_MS,
  shouldSkipPoll = () => false,
}: Options): () => void {
  let source: EventSourceLike | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const invalidate = (keys: readonly string[]) => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: [key] });
  };

  const setStatus = (status: LiveStatus) => onStatus?.(status);

  const stopPolling = () => {
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = null;
  };

  const connect = () => {
    const es = createEventSource(url);
    source = es;

    es.onopen = () => {
      if (stopped || source !== es) return;
      // Coming back from polling: events may have been missed while disconnected.
      if (pollTimer !== null) invalidate(ALL_KEYS);
      stopPolling();
      setStatus("live");
    };

    es.onerror = () => {
      if (stopped || source !== es) return;
      es.close();
      source = null;
      startPolling();
    };

    for (const [event, keys] of Object.entries(EVENT_INVALIDATIONS)) {
      es.addEventListener(event, () => invalidate(keys));
    }
  };

  const startPolling = () => {
    setStatus("polling");
    if (pollTimer !== null) return;
    pollTimer = setInterval(() => {
      if (stopped || shouldSkipPoll()) return;
      invalidate(ALL_KEYS);
      if (source === null) connect();
    }, pollIntervalMs);
  };

  setStatus("connecting");
  connect();

  return () => {
    stopped = true;
    stopPolling();
    source?.close();
    source = null;
  };
}
