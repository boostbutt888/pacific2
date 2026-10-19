import {
  BP_DENOMINATOR,
  assertNonNegativeMinor,
  mulDivHalfUp,
  type BasisPoints,
  type Minor,
} from "./rounding.js";

export type PriceMode = "INCLUSIVE" | "EXCLUSIVE";

/** Singapore GST 9% from 2024-01-01 (US-081 AC4). Stored as data on the tax profile; this is the default. */
export const SG_GST_RATE_BP: BasisPoints = 900;

/**
 * GST contained in a GST-inclusive amount: round_half_up(amount * r / (1 + r)).
 * With r = 900 bp: amount * 900 / 10900 (= amount * 9 / 109).
 * Applied once per store order (D-096).
 */
export function gstFromInclusive(amountInclusive: Minor, rateBp: BasisPoints): Minor {
  assertNonNegativeMinor(amountInclusive, "amountInclusive");
  assertNonNegativeMinor(rateBp, "rateBp");
  return mulDivHalfUp(amountInclusive, rateBp, BP_DENOMINATOR + rateBp);
}

/**
 * GST added on a GST-exclusive amount: round_half_up(amount * r).
 * Applied once per store order (D-096).
 */
export function gstOnExclusive(amountExclusive: Minor, rateBp: BasisPoints): Minor {
  assertNonNegativeMinor(amountExclusive, "amountExclusive");
  assertNonNegativeMinor(rateBp, "rateBp");
  return mulDivHalfUp(amountExclusive, rateBp, BP_DENOMINATOR);
}

/** GST for one store order's taxable total under the given price mode. */
export function gstForStoreOrder(taxableTotal: Minor, mode: PriceMode, rateBp: BasisPoints): Minor {
  return mode === "INCLUSIVE" ? gstFromInclusive(taxableTotal, rateBp) : gstOnExclusive(taxableTotal, rateBp);
}

/**
 * IRAS simplified tax invoice: allowed when the total payable incl. GST is <= $1,000
 * (US-084 AC1, AC8). Evaluated per store order, which is the invoice unit (D-096).
 */
export const SIMPLIFIED_INVOICE_LIMIT_MINOR: Minor = 100_000;

export function isSimplifiedInvoiceAllowed(storeOrderTotalInclGst: Minor): boolean {
  assertNonNegativeMinor(storeOrderTotalInclGst, "storeOrderTotalInclGst");
  return storeOrderTotalInclGst <= SIMPLIFIED_INVOICE_LIMIT_MINOR;
}
