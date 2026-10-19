/**
 * Integer money helpers (ADR-009 §2, TLP-01).
 *
 * All amounts are integer minor units (cents for SGD). Rates are integer basis points
 * (900 = 9%). No floating-point arithmetic is used for money: products are computed with
 * BigInt and every division names its rounding rule explicitly.
 */

export type Minor = number;
export type BasisPoints = number;

export const BP_DENOMINATOR = 10_000;

export class MoneyError extends Error {
  constructor(
    public readonly code:
      | "NOT_INTEGER"
      | "NEGATIVE_AMOUNT"
      | "DIVISION_BY_ZERO"
      | "UNSAFE_INTEGER"
      | "INVALID_QUANTITY"
      | "DISCOUNT_EXCEEDS_TOTAL"
      | "SERVICE_CHARGE_REQUIRES_EXCLUSIVE"
      | "INVALID_INPUT",
    message: string,
  ) {
    super(message);
    this.name = "MoneyError";
  }
}

export function assertMinor(value: number, label = "amount"): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError("NOT_INTEGER", `${label} must be an integer number of minor units, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError("UNSAFE_INTEGER", `${label} is outside the safe integer range`);
  }
}

export function assertNonNegativeMinor(value: number, label = "amount"): void {
  assertMinor(value, label);
  if (value < 0) {
    throw new MoneyError("NEGATIVE_AMOUNT", `${label} must be >= 0, got ${value}`);
  }
}

function toNumber(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new MoneyError("UNSAFE_INTEGER", "result is outside the safe integer range");
  }
  return n;
}

/**
 * floor(a * b / c) for non-negative integers, plus the remainder (a * b) mod c.
 * Used by largest-remainder allocation.
 */
export function mulDivFloor(a: number, b: number, c: number): { quotient: number; remainder: bigint } {
  assertNonNegativeMinor(a, "a");
  assertNonNegativeMinor(b, "b");
  assertNonNegativeMinor(c, "c");
  if (c === 0) throw new MoneyError("DIVISION_BY_ZERO", "division by zero");
  const product = BigInt(a) * BigInt(b);
  const divisor = BigInt(c);
  return { quotient: toNumber(product / divisor), remainder: product % divisor };
}

/**
 * round_half_up(a * b / c) for non-negative integers: exactly half rounds up
 * (0.5 cent -> 1 cent). This is the only rounding rule used for GST, percentage
 * discounts, service charge and gateway fees (D-096, ADR-009 §4).
 */
export function mulDivHalfUp(a: number, b: number, c: number): number {
  const { quotient, remainder } = mulDivFloor(a, b, c);
  return remainder * 2n >= BigInt(c) ? quotient + 1 : quotient;
}

/** Percentage (basis points) of an amount, rounded half-up to the minor unit. */
export function percentOf(amount: Minor, rateBp: BasisPoints): Minor {
  return mulDivHalfUp(amount, rateBp, BP_DENOMINATOR);
}

export function sum(values: readonly Minor[]): Minor {
  let total = 0;
  for (const v of values) {
    assertMinor(v);
    total += v;
  }
  assertMinor(total, "sum");
  return total;
}

/** Formats minor units for logs and tests only (never for calculation). */
export function formatMinor(amount: Minor, exponent = 2): string {
  assertMinor(amount);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const unit = 10 ** exponent;
  const major = Math.trunc(abs / unit);
  const minor = String(abs % unit).padStart(exponent, "0");
  return `${sign}${major}.${minor}`;
}
