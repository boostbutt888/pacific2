import { assertNonNegativeMinor, percentOf, MoneyError, type BasisPoints, type Minor } from "./rounding.js";

/**
 * STYL gateway transaction-fee accrual (UC-145, US-010; ADR-004 §8).
 *
 * Fee base = net settled amount after refunds (A9). Each accrual row is rounded half-up
 * to the cent. To keep a payment's total fee equal to the fee on its current net amount
 * (US-010 AC4) without restating an earlier month (US-010 AC5), a refund's fee reduction is:
 *
 *   reduction = fee(net before the refund) - fee(net after the refund)
 *
 * Example at 150 bp: sale $1.10 -> fee 2c (1.65 half-up); refund $0.30 -> reduction
 * fee(110) - fee(80) = 2 - 1 = 1c; total fee 1c = fee(80). Rounding the refund on its own
 * (0.45 -> 0c) would leave 2c on an 80c net.
 */
export function gatewayFee(amountMinor: Minor, rateBp: BasisPoints): Minor {
  return percentOf(amountMinor, rateBp);
}

export function gatewayFeeReduction(
  netBeforeRefundMinor: Minor,
  refundMinor: Minor,
  rateBp: BasisPoints,
): Minor {
  assertNonNegativeMinor(netBeforeRefundMinor, "netBeforeRefundMinor");
  assertNonNegativeMinor(refundMinor, "refundMinor");
  if (refundMinor > netBeforeRefundMinor) {
    throw new MoneyError("INVALID_INPUT", "refund exceeds the net settled amount");
  }
  return gatewayFee(netBeforeRefundMinor, rateBp) - gatewayFee(netBeforeRefundMinor - refundMinor, rateBp);
}
