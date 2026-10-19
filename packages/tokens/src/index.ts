/**
 * Pacific2 design tokens (UI Designer, G4 approved 2026-10-19, D-144).
 * Source of truth: docs/ui/tokens.json (W3C design-token format). Synced into this package by
 * `pnpm tokens:sync`; never edit tokens.json / tokens.css here by hand.
 * Apps import the CSS once: `import "@pacific2/tokens/tokens.css";`
 */
import tokens from "./tokens.json";

export type DesignTokens = typeof tokens;
export { tokens };

/** Resolves a primitive colour such as ("blue", "600") -> "#1A5FB4". */
export function primitiveColor(family: keyof DesignTokens["color"], step: string): string {
  const group = tokens.color[family] as unknown as Record<string, { $value: string } | undefined>;
  const entry = group[step];
  if (!entry) throw new Error(`Unknown colour token color.${String(family)}.${step}`);
  return entry.$value;
}

/** CSS custom-property name for a token path, e.g. ["brand","primary"] -> "--p2-brand-primary". */
export function cssVar(...path: string[]): string {
  return `--p2-${path.join("-")}`;
}

/** Pacific2 brand colours (D-128). Operator themes override them at runtime (US-354, THEMING.md). */
export const PACIFIC2_PRIMARY = "#1A5FB4";
export const PACIFIC2_TEAL = "#0B6862";
