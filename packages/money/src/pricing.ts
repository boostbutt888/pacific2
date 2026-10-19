/**
 * Checkout pricing engine (ADR-009 §3-§5). Pure and deterministic: the same function runs on the
 * POS (also offline, ADR-007 §6), on SOK / COP previews and on the API, which is authoritative
 * (US-082 AC10: a client GST figure is never trusted).
 *
 * Order of calculation per store order (ADR-009 §4.1):
 *   1. line gross = (unit price + modifier prices) x qty
 *   2. line discounts
 *   3. order-level discount: allocated to store orders, then to lines, by largest remainder (NA-28)
 *   4. container fees (takeaway; never discountable, D-135 f)
 *   5. service charge on the discounted item subtotal (`v1.0.0`, exclusive mode only [proposal])
 *   6. GST once per store order, half-up (D-096); allocated back to lines by largest remainder
 * The checkout total is the sum of its store orders (D-096). Cash rounding is a payment
 * adjustment (cash.ts), outside this calculation.
 */
import { allocateLargestRemainder } from "./allocate.js";
import { gstForStoreOrder, isSimplifiedInvoiceAllowed, type PriceMode } from "./gst.js";
import {
  BP_DENOMINATOR,
  MoneyError,
  assertNonNegativeMinor,
  percentOf,
  sum,
  type BasisPoints,
  type Minor,
} from "./rounding.js";

export type Discount = { kind: "PERCENT"; rateBp: BasisPoints } | { kind: "AMOUNT"; amountMinor: Minor };

export type OrderType = "DINE_IN" | "TAKEAWAY";

export interface TaxProfile {
  priceMode: PriceMode;
  gstRateBp: BasisPoints;
  /** Not GST-registered -> no GST charged or shown (US-081 AC5). */
  gstRegistered: boolean;
  /** Service charge for this site x order type (`v1.0.0`, UC-111). 0 or absent = none (Agilent, D-091). */
  serviceChargeBp?: BasisPoints;
}

export interface LineInput {
  id: string;
  storeId: string;
  /** Resolved price for store x channel x order type (price rules are resolved upstream). */
  unitPriceMinor: Minor;
  /** Per-unit modifier and upsize prices. */
  modifierPricesMinor?: readonly Minor[];
  qty: number;
  lineDiscount?: Discount;
  /** Per-item container fee, charged per unit on takeaway orders (US-032 AC1). */
  containerFeePerItemMinor?: Minor;
}

export interface StoreInput {
  storeId: string;
  /** Per-order container fee, charged once per store order on takeaway (US-032 AC2, NA-17). */
  containerFeePerOrderMinor?: Minor;
}

export interface CheckoutInput {
  orderType: OrderType;
  /** Stores in the site's store display order (D-105). Stores without lines are skipped. */
  stores: readonly StoreInput[];
  /** Lines in the order added (D-105). */
  lines: readonly LineInput[];
  orderDiscount?: Discount;
}

export interface PricedLine {
  id: string;
  storeId: string;
  qty: number;
  unitPriceMinor: Minor;
  grossMinor: Minor;
  lineDiscountMinor: Minor;
  orderDiscountMinor: Minor;
  netMinor: Minor;
  /** Share of the store order's GST (largest remainder) used for refunds and item reports. */
  gstMinor: Minor;
}

export interface PricedCharge {
  kind: "CONTAINER_FEE" | "SERVICE_CHARGE";
  /** Set for per-item container fees. */
  lineId?: string;
  amountMinor: Minor;
  gstMinor: Minor;
}

export interface PricedStoreOrder {
  storeId: string;
  lines: PricedLine[];
  charges: PricedCharge[];
  itemsGrossMinor: Minor;
  discountMinor: Minor;
  itemsNetMinor: Minor;
  containerFeeMinor: Minor;
  serviceChargeMinor: Minor;
  /** Amount GST is computed on (inclusive mode: GST is inside it). */
  taxableMinor: Minor;
  gstMinor: Minor;
  /** Total payable for this store order incl. GST. */
  totalMinor: Minor;
  simplifiedInvoiceAllowed: boolean;
}

export interface PricedCheckout {
  priceMode: PriceMode;
  storeOrders: PricedStoreOrder[];
  /** Order total before discounts, container fees excluded (NA-20, D-135 f). */
  discountBaseMinor: Minor;
  discountMinor: Minor;
  gstMinor: Minor;
  totalMinor: Minor;
  /** Cumulative effective discount > 20% -> Supervisor PIN (D-037, NA-20). */
  supervisorRequiredForDiscount: boolean;
}

/** D-037: Supervisor PIN when the cumulative effective discount is above 20%. */
export const SUPERVISOR_DISCOUNT_THRESHOLD_BP: BasisPoints = 2_000;

/** Strictly greater than the threshold, compared in integers (US-049 AC3: 20.0% no, 20.1% yes). */
export function discountNeedsSupervisor(
  discountMinor: Minor,
  baseMinor: Minor,
  thresholdBp: BasisPoints = SUPERVISOR_DISCOUNT_THRESHOLD_BP,
): boolean {
  assertNonNegativeMinor(discountMinor, "discountMinor");
  assertNonNegativeMinor(baseMinor, "baseMinor");
  if (discountMinor === 0) return false;
  if (baseMinor === 0) return true;
  return BigInt(discountMinor) * BigInt(BP_DENOMINATOR) > BigInt(baseMinor) * BigInt(thresholdBp);
}

function discountAmount(discount: Discount | undefined, base: Minor, label: string): Minor {
  if (!discount) return 0;
  const amount = discount.kind === "PERCENT" ? percentOf(base, discount.rateBp) : discount.amountMinor;
  assertNonNegativeMinor(amount, label);
  if (amount > base) {
    throw new MoneyError("DISCOUNT_EXCEEDS_TOTAL", `${label} ${amount} exceeds its base ${base}`);
  }
  return amount;
}

export function priceCheckout(input: CheckoutInput, profile: TaxProfile): PricedCheckout {
  const storeIndex = new Map(input.stores.map((s, i) => [s.storeId, i]));
  if (storeIndex.size !== input.stores.length) {
    throw new MoneyError("INVALID_INPUT", "duplicate storeId in stores");
  }

  // 1-2. Line gross and line discounts.
  const working = input.lines.map((line) => {
    if (!storeIndex.has(line.storeId)) {
      throw new MoneyError("INVALID_INPUT", `line ${line.id} refers to unknown store ${line.storeId}`);
    }
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      throw new MoneyError("INVALID_QUANTITY", `line ${line.id} qty must be a positive integer`);
    }
    assertNonNegativeMinor(line.unitPriceMinor, "unitPriceMinor");
    const modifiers = line.modifierPricesMinor ?? [];
    modifiers.forEach((m) => assertNonNegativeMinor(m, "modifierPriceMinor"));
    const unit = line.unitPriceMinor + sum(modifiers);
    const gross = unit * line.qty;
    assertNonNegativeMinor(gross, "line gross");
    const lineDiscount = discountAmount(line.lineDiscount, gross, `line ${line.id} discount`);
    return { line, unit, gross, lineDiscount, afterLine: gross - lineDiscount, orderDiscount: 0 };
  });

  // 3. Order-level discount, two-level largest remainder (NA-28).
  const activeStores = input.stores.filter((s) => working.some((w) => w.line.storeId === s.storeId));
  const linesOf = (storeId: string) => working.filter((w) => w.line.storeId === storeId);
  const afterLineTotal = sum(working.map((w) => w.afterLine));
  const orderDiscount = discountAmount(input.orderDiscount, afterLineTotal, "order discount");
  if (orderDiscount > 0) {
    const storeShares = allocateLargestRemainder(
      orderDiscount,
      activeStores.map((s) => sum(linesOf(s.storeId).map((w) => w.afterLine))),
    );
    activeStores.forEach((store, i) => {
      const lines = linesOf(store.storeId);
      const lineShares = allocateLargestRemainder(
        storeShares[i] ?? 0,
        lines.map((w) => w.afterLine),
      );
      lines.forEach((w, j) => {
        w.orderDiscount = lineShares[j] ?? 0;
      });
    });
  }

  const serviceChargeBp = profile.serviceChargeBp ?? 0;
  if (serviceChargeBp > 0 && profile.priceMode !== "EXCLUSIVE") {
    throw new MoneyError(
      "SERVICE_CHARGE_REQUIRES_EXCLUSIVE",
      "service charge is supported with GST-exclusive pricing only in MVP1 (ADR-009 §4.1 [proposal])",
    );
  }

  // 4-6. Per store order.
  const storeOrders: PricedStoreOrder[] = activeStores.map((store) => {
    const lines = linesOf(store.storeId);
    const charges: PricedCharge[] = [];
    if (input.orderType === "TAKEAWAY") {
      for (const w of lines) {
        const perItem = w.line.containerFeePerItemMinor ?? 0;
        assertNonNegativeMinor(perItem, "containerFeePerItemMinor");
        if (perItem > 0) {
          charges.push({
            kind: "CONTAINER_FEE",
            lineId: w.line.id,
            amountMinor: perItem * w.line.qty,
            gstMinor: 0,
          });
        }
      }
      const perOrder = store.containerFeePerOrderMinor ?? 0;
      assertNonNegativeMinor(perOrder, "containerFeePerOrderMinor");
      if (perOrder > 0) charges.push({ kind: "CONTAINER_FEE", amountMinor: perOrder, gstMinor: 0 });
    }

    const itemsGross = sum(lines.map((w) => w.gross));
    const discount = sum(lines.map((w) => w.lineDiscount + w.orderDiscount));
    const itemsNet = itemsGross - discount;
    const containerFee = sum(charges.map((c) => c.amountMinor));
    const serviceCharge = serviceChargeBp > 0 ? percentOf(itemsNet, serviceChargeBp) : 0;
    if (serviceCharge > 0) charges.push({ kind: "SERVICE_CHARGE", amountMinor: serviceCharge, gstMinor: 0 });

    const taxable = itemsNet + containerFee + serviceCharge;
    const gst = profile.gstRegistered ? gstForStoreOrder(taxable, profile.priceMode, profile.gstRateBp) : 0;
    const total = profile.priceMode === "INCLUSIVE" ? taxable : taxable + gst;

    // GST back to lines then charges, largest remainder, ties to the item listed first.
    const gstShares = allocateLargestRemainder(gst, [
      ...lines.map((w) => w.afterLine - w.orderDiscount),
      ...charges.map((c) => c.amountMinor),
    ]);
    const pricedLines: PricedLine[] = lines.map((w, j) => ({
      id: w.line.id,
      storeId: w.line.storeId,
      qty: w.line.qty,
      unitPriceMinor: w.unit,
      grossMinor: w.gross,
      lineDiscountMinor: w.lineDiscount,
      orderDiscountMinor: w.orderDiscount,
      netMinor: w.afterLine - w.orderDiscount,
      gstMinor: gstShares[j] ?? 0,
    }));
    charges.forEach((c, k) => {
      c.gstMinor = gstShares[lines.length + k] ?? 0;
    });

    return {
      storeId: store.storeId,
      lines: pricedLines,
      charges,
      itemsGrossMinor: itemsGross,
      discountMinor: discount,
      itemsNetMinor: itemsNet,
      containerFeeMinor: containerFee,
      serviceChargeMinor: serviceCharge,
      taxableMinor: taxable,
      gstMinor: gst,
      totalMinor: total,
      simplifiedInvoiceAllowed: isSimplifiedInvoiceAllowed(total),
    };
  });

  const discountBase = sum(working.map((w) => w.gross));
  const discountTotal = sum(storeOrders.map((s) => s.discountMinor));
  return {
    priceMode: profile.priceMode,
    storeOrders,
    discountBaseMinor: discountBase,
    discountMinor: discountTotal,
    gstMinor: sum(storeOrders.map((s) => s.gstMinor)),
    totalMinor: sum(storeOrders.map((s) => s.totalMinor)),
    supervisorRequiredForDiscount: discountNeedsSupervisor(discountTotal, discountBase),
  };
}
