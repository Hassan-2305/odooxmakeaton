/**
 * Recurra design tokens. This file is the single source of truth for colour:
 * `applyTheme()` writes every token to a CSS variable on <html>, and index.css maps
 * those variables into Tailwind (`bg-primary`, `text-status-paid-fg`, ...).
 */

export const colors = {
  background: "#f4f2ee", // warm paper
  foreground: "#0f172a", // slate ink
  surface: "#f9f8f6", // table headers, footers, subtle panels
  "surface-foreground": "#0f172a",
  card: "#ffffff",
  "card-foreground": "#0f172a",
  popover: "#ffffff",
  "popover-foreground": "#0f172a",
  primary: "#e8601a", // brand orange
  "primary-foreground": "#ffffff",
  secondary: "#f1eee9",
  "secondary-foreground": "#0f172a",
  muted: "#f1eee9",
  "muted-foreground": "#6b665e",
  accent: "#fff1e8", // orange tint for hover / active nav
  "accent-foreground": "#c2410c",
  destructive: "#dc2626",
  "destructive-foreground": "#ffffff",
  border: "#e7e2da",
  input: "#dbd5cc",
  ring: "#f97316",
  // Dark navy sidebar
  sidebar: "#0f1729",
  "sidebar-foreground": "#cbd5e1",
  "sidebar-muted": "#7c879c",
  "sidebar-accent": "#2a1d1a", // warm tint behind the active item
  "sidebar-border": "#1e293b",
} as const;

/** Status palette: each tone has a strong colour, a soft background and readable text. */
export const statusColors = {
  paid: { solid: "#16a34a", bg: "#dcfce7", fg: "#166534" },
  "due-soon": { solid: "#d97706", bg: "#fef3c7", fg: "#92400e" },
  overdue: { solid: "#dc2626", bg: "#fee2e2", fg: "#991b1b" },
  draft: { solid: "#71717a", bg: "#f1f1f3", fg: "#3f3f46" },
} as const;

export type StatusTone = keyof typeof statusColors;

export const radius = "0.625rem";

/** Every token as a CSS custom property, e.g. `--primary`, `--status-paid-bg`. */
export function themeVariables(): Record<string, string> {
  const vars: Record<string, string> = { "--radius": radius };
  for (const [name, value] of Object.entries(colors)) vars[`--${name}`] = value;
  for (const [tone, shades] of Object.entries(statusColors)) {
    vars[`--status-${tone}`] = shades.solid;
    vars[`--status-${tone}-bg`] = shades.bg;
    vars[`--status-${tone}-fg`] = shades.fg;
  }
  return vars;
}

export function applyTheme(root: HTMLElement = document.documentElement) {
  for (const [name, value] of Object.entries(themeVariables())) root.style.setProperty(name, value);
}
