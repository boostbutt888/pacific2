import { MoneyError, assertNonNegativeMinor, mulDivFloor, type Minor } from "./rounding.js";

/**
 * Largest-remainder allocation (NA-28, D-100; ADR-009 §4.2).
 *
 * Splits `total` across `weights` pro rata so the parts sum to `total` exactly.
 * 1. Each part gets floor(total * w_i / W).
 * 2. The cents left over go one each to the parts with the largest remainders.
 * 3. Ties go to the part listed first (lowest index). Callers pass weights in the
 *    cart display order (D-105): stores in the site's store display order, lines in
 *    the order added; split bills in bill order.
 */
export function allocateLargestRemainder(total: Minor, weights: readonly Minor[]): Minor[] {
  assertNonNegativeMinor(total, "total");
  weights.forEach((w, i) => assertNonNegativeMinor(w, `weights[${i}]`));
  if (weights.length === 0) {
    if (total === 0) return [];
    throw new MoneyError("INVALID_INPUT", "cannot allocate a non-zero total to zero weights");
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    if (total === 0) return weights.map(() => 0);
    throw new MoneyError("INVALID_INPUT", "cannot allocate a non-zero total when all weights are zero");
  }

  const parts: Minor[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];
  let allocated = 0;
  weights.forEach((w, index) => {
    const { quotient, remainder } = mulDivFloor(total, w, weightSum);
    parts.push(quotient);
    remainders.push({ index, remainder });
    allocated += quotient;
  });

  let leftover = total - allocated;
  // Stable order: larger remainder first; equal remainders keep the listed order.
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const { index } of remainders) {
    if (leftover === 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    leftover -= 1;
  }
  return parts;
}

/** Equal split (split bill, `v1.0.0` US-063): 1000 / 3 -> 334, 333, 333. */
export function splitEqually(total: Minor, parts: number): Minor[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError("INVALID_INPUT", "parts must be a positive integer");
  }
  return allocateLargestRemainder(
    total,
    Array.from({ length: parts }, () => 1),
  );
}
