import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startLiveUpdates, type EventSourceLike, type LiveStatus } from "./live-updates";

class FakeEventSource implements EventSourceLike {
  onopen: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  closed = false;
  private listeners = new Map<string, ((ev: MessageEvent) => void)[]>();

  addEventListener(type: string, listener: (ev: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.(new Event("open"));
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
  emit(type: string) {
    for (const l of this.listeners.get(type) ?? []) l(new MessageEvent(type, { data: "{}" }));
  }
}

function setup() {
  const sources: FakeEventSource[] = [];
  const statuses: LiveStatus[] = [];
  const invalidateQueries = vi.fn(async () => {});
  const stop = startLiveUpdates({
    queryClient: { invalidateQueries },
    createEventSource: () => {
      const es = new FakeEventSource();
      sources.push(es);
      return es;
    },
    onStatus: (s) => statuses.push(s),
  });
  const invalidated = () => invalidateQueries.mock.calls.map((c) => (c as unknown as [{ queryKey: string[] }])[0].queryKey[0]);
  return { sources, statuses, invalidateQueries, invalidated, stop };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("startLiveUpdates", () => {
  it.each([
    ["invoice.created", ["invoices", "reports"]],
    ["payment.recorded", ["payments", "invoices", "reports"]],
    ["billing_run.finished", ["runs", "reports"]],
  ])("%s invalidates %j", (event, keys) => {
    const t = setup();
    t.sources[0]!.open();
    t.sources[0]!.emit(event);
    expect(t.invalidated()).toEqual(keys);
    expect(t.statuses).toEqual(["connecting", "live"]);
  });

  it("ignores unrelated events", () => {
    const t = setup();
    t.sources[0]!.open();
    t.sources[0]!.emit("ready");
    expect(t.invalidateQueries).not.toHaveBeenCalled();
  });

  it("falls back to 30s polling when the stream errors, then recovers", () => {
    const t = setup();
    t.sources[0]!.fail();
    expect(t.sources[0]!.closed).toBe(true);
    expect(t.statuses.at(-1)).toBe("polling");

    vi.advanceTimersByTime(29_999);
    expect(t.invalidateQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(new Set(t.invalidated())).toEqual(new Set(["invoices", "payments", "runs", "reports"]));
    // The tick also retried the stream.
    expect(t.sources).toHaveLength(2);

    t.invalidateQueries.mockClear();
    t.sources[1]!.open();
    expect(t.statuses.at(-1)).toBe("live");
    // Catch up on anything missed while disconnected.
    expect(new Set(t.invalidated())).toEqual(new Set(["invoices", "payments", "runs", "reports"]));

    t.invalidateQueries.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(t.invalidateQueries).not.toHaveBeenCalled();
  });

  it("keeps polling while reconnects keep failing", () => {
    const t = setup();
    t.sources[0]!.fail();
    vi.advanceTimersByTime(30_000);
    t.sources[1]!.fail();
    vi.advanceTimersByTime(30_000);
    expect(t.sources).toHaveLength(3);
    expect(t.statuses.at(-1)).toBe("polling");
  });

  it("closes the stream and stops polling when stopped", () => {
    const t = setup();
    t.sources[0]!.fail();
    t.stop();
    vi.advanceTimersByTime(120_000);
    expect(t.invalidateQueries).not.toHaveBeenCalled();
    expect(t.sources).toHaveLength(1);
  });
});
