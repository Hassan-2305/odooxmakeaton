import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand artwork: topographic contour loops, deterministic (no randomness), drawn as one SVG.
 * The loops echo the single-stroke loop in the logo. Colour comes from `currentColor`.
 */

type Centre = { x: number; y: number; rings: number; base: number; step: number; phase: number };

function ringPath(cx: number, cy: number, r: number, k: number, phase: number) {
  const n = 64;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const wobble =
      1 +
      0.09 * Math.sin(3 * t + phase + k * 0.32) +
      0.05 * Math.sin(5 * t - phase * 1.7 - k * 0.45) +
      0.025 * Math.cos(8 * t + k * 0.8);
    pts.push([cx + Math.cos(t) * r * wobble * 1.18, cy + Math.sin(t) * r * wobble]);
  }
  // Closed Catmull-Rom spline through the points, as cubic Béziers.
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

const VARIANTS: Record<"band" | "hero" | "corner", { w: number; h: number; centres: Centre[] }> = {
  band: {
    w: 1600,
    h: 420,
    centres: [
      { x: 1180, y: 360, rings: 16, base: 30, step: 26, phase: 0.4 },
      { x: 520, y: 470, rings: 10, base: 40, step: 30, phase: 2.1 },
    ],
  },
  hero: {
    w: 900,
    h: 900,
    centres: [
      { x: 640, y: 300, rings: 18, base: 24, step: 28, phase: 1.2 },
      { x: 120, y: 860, rings: 9, base: 50, step: 32, phase: 3.3 },
    ],
  },
  corner: {
    w: 800,
    h: 600,
    centres: [{ x: 780, y: 600, rings: 14, base: 40, step: 30, phase: 2.6 }],
  },
};

export function ContourArt({
  variant = "band",
  className,
  highlight = 4,
}: {
  variant?: keyof typeof VARIANTS;
  className?: string;
  /** Index of one ring per centre drawn in the accent colour. */
  highlight?: number;
}) {
  const { w, h, centres } = VARIANTS[variant];
  const rings = useMemo(
    () =>
      centres.flatMap((c, ci) =>
        Array.from({ length: c.rings }, (_, k) => ({
          d: ringPath(c.x, c.y, c.base + k * c.step, k, c.phase),
          accent: ci === 0 && k === highlight,
          key: `${ci}-${k}`,
        })),
      ),
    [centres, highlight],
  );
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      className={cn("pointer-events-none", className)}
      aria-hidden
    >
      {rings.map((r) => (
        <path
          key={r.key}
          d={r.d}
          stroke={r.accent ? "#F26A1B" : "currentColor"}
          strokeOpacity={r.accent ? 0.75 : undefined}
          strokeWidth={r.accent ? 1.6 : 1}
        />
      ))}
    </svg>
  );
}
