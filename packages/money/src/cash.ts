import { MoneyError, assertMinor, assertNonNegativeMinor, type Minor } from "./rounding.js";

/** Per-site setting (D-111). Agilent = NONE. */
export type CashRounding = "NONE" | "NEAREST_5";

export interface CashDue {
  /** Amount the customer pays in cash after rounding. */
  dueMinor: Minor;
  /** Payment adjustment outside the GST base (ADR-009 §4.6): due - total. */
  roundingMinor: Minor;
}

/**
 * Cash rounding to the nearest 5 cents (NA-13, US-065 AC3). Last cent digit:
 * 1, 2 -> down to 0 · 3, 4 -> up to 5 · 6, 7 -> down to 5 · 8, 9 -> up to the next 0 · 0, 5 unchanged.
 * Applies to cash tenders only (US-065 AC5) and never changes GST (US-082 AC8).
 */
export function cashDue(totalMinor: Minor, mode: CashRounding): CashDue {
  assertNonNegativeMinor(totalMinor, "totalMinor");
  if (mode === "NONE") return { dueMinor: totalMinor, roundingMinor: 0 };
  const lastDigit = totalMinor % 10;
  const base = totalMinor - lastDigit;
  let due: Minor;
  if (lastDigit <= 2) due = base;
  else if (lastDigit <= 4) due = base + 5;
  else if (lastDigit <= 7) due = base + 5;
  else due = base + 10;
  return { dueMinor: due, roundingMinor: due - totalMinor };
}

/** Change due for a cash tender (US-065 AC1, AC4). */
export function changeDue(dueMinor: Minor, tenderedMinor: Minor): Minor {
  assertNonNegativeMinor(dueMinor, "dueMinor");
  assertMinor(tenderedMinor, "tenderedMinor");
  if (tenderedMinor < dueMinor) {
    throw new MoneyError("INVALID_INPUT", `short by ${dueMinor - tenderedMinor} minor units`);
  }
  return tenderedMinor - dueMinor;
}
