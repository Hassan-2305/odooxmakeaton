import { EventEmitter } from "node:events";

export interface AppEvent<P = unknown> {
  /** Monotonic per process; sent as the SSE `id`. */
  id: number;
  event: string;
  payload: P;
  at: string;
}

export type EventListener = (event: AppEvent) => void;

/**
 * In-process event bus. Services call `emit` after a write commits; the SSE
 * endpoint forwards every event to connected clients. Single process only:
 * events are not shared between API instances.
 */
export function createEventBus() {
  const emitter = new EventEmitter();
  // One listener per open SSE connection.
  emitter.setMaxListeners(0);
  let nextId = 1;

  return {
    emit<P>(event: string, payload: P): AppEvent<P> {
      const appEvent: AppEvent<P> = { id: nextId++, event, payload, at: new Date().toISOString() };
      emitter.emit("event", appEvent);
      return appEvent;
    },
    /** Returns an unsubscribe function. */
    subscribe(listener: EventListener): () => void {
      emitter.on("event", listener);
      return () => emitter.off("event", listener);
    },
    listenerCount(): number {
      return emitter.listenerCount("event");
    },
  };
}

export type EventBus = ReturnType<typeof createEventBus>;

/** The bus used by the running server. Tests create their own with `createEventBus()`. */
export const eventBus = createEventBus();

export const emit = eventBus.emit;
