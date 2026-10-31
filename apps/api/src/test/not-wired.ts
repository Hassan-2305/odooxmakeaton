/**
 * Stand-in for a database-backed service in route tests that don't exercise it.
 * Any method call throws, so a test that needs the real thing fails loudly.
 */
export function notWired<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return () => {
        throw new Error(`${name}.${String(prop)} is not wired in this test; pass it to createTestApp`);
      };
    },
  });
}
