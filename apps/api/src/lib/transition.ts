import { InvalidTransitionError } from "./errors.js";

/** For each status, the statuses it may move to. Terminal statuses map to `[]`. */
export type TransitionMap<S extends string> = { readonly [From in S]: readonly NoInfer<S>[] };

/**
 * Wraps a transition map. Every status change must go through `assert`, so a move
 * that isn't in the map is rejected instead of silently written.
 *
 *   const invoiceTransitions = createTransitions("invoice", {
 *     draft: ["confirmed", "cancelled"],
 *     confirmed: ["paid", "cancelled"],
 *     paid: [],
 *     cancelled: [],
 *   });
 *   invoiceTransitions.assert(invoice.status, "paid");
 */
export function createTransitions<S extends string>(entity: string, map: TransitionMap<S>) {
  return {
    map,
    allowedFrom(from: S): readonly S[] {
      return map[from] ?? [];
    },
    can(from: S, to: S): boolean {
      return (map[from] ?? []).includes(to);
    },
    /** Throws InvalidTransitionError (409) when `from → to` isn't allowed. */
    assert(from: S, to: S): void {
      const allowed = map[from] ?? [];
      if (!allowed.includes(to)) {
        throw new InvalidTransitionError(entity, from, to, allowed);
      }
    },
  };
}

export type Transitions<S extends string> = ReturnType<typeof createTransitions<S>>;
