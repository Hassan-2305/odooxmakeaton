export type ToastVariant = "success" | "error";

export interface ToastItem {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
}

const DURATION_MS = 5000;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(variant: ToastVariant, title: string, description?: string) {
  const id = nextId++;
  // Keep the stack short: oldest drop off first.
  items = [...items.slice(-3), { id, variant, title, description }];
  emit();
  setTimeout(() => dismissToast(id), DURATION_MS);
}

/** Short-lived notice in the corner, e.g. after a mutation succeeds or fails. Rendered by <Toaster>. */
export const toast = {
  success: (title: string, description?: string) => push("success", title, description),
  error: (title: string, description?: string) => push("error", title, description),
};

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getToasts = () => items;
