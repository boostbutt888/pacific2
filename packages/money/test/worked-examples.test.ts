/**
 * ADR-009 worked examples W1-W25 (docs/tech/adr/ADR-009-site-locale-tax-profile.md §6).
 * Each test names its source story AC and the QA oracle (TEST_STRATEGY §3.1, P-numbers).
 * Code-review gate: "GST/service-charge calculation unit-tested against worked examples".
 */
import { describe, expect, it } from "vitest";
import {
  SG_GST_RATE_BP,
  allocateLargestRemainder,
  cashDue,
  changeDue,
  discountNeedsSupervisor,
  gatewayFee,
  gatewayFeeReduction,
  gstFromInclusive,
  gstOnExclusive,
  isSimplifiedInvoiceAllowed,
  priceCheckout,
  splitEqually,
  type CheckoutInput,
  type TaxProfile,
} from "../src/index.js";

const INCL: TaxProfile = { priceMode: "INCLUSIVE", gstRateBp: SG_GST_RATE_BP, gstRegistered: true };
const EXCL: TaxProfile = { priceMode: "EXCLUSIVE", gstRateBp: SG_GST_RATE_BP, gstRegistered: true };

const S1 = { storeId: "stall-1" };
const S2 = { storeId: "stall-2" };

function oneStore(lines: CheckoutInput["lines"], extra: Partial<CheckoutInput> = {}): CheckoutInput {
  return { orderType: "DINE_IN", stores: [S1], lines, ...extra };
}

describe("ADR-009 worked examples — GST per store order (D-096)", () => {
  it("W1 inclusive single item $5.50 -> GST $0.45, net $5.05", () => {
    const r = priceCheckout(oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 550, qty: 1 }]), INCL);
    expect(r.gstMinor).toBe(45);
    expect(r.totalMinor).toBe(550);
    expect(r.totalMinor - r.gstMinor).toBe(505);
  });

  it("W2 US-082 AC1 (P1): inclusive $13.80 -> GST $1.14, net $12.66", () => {
    expect(gstFromInclusive(1380, 900)).toBe(114);
    const r = priceCheckout(oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 1380, qty: 1 }]), INCL);
    expect(r.gstMinor).toBe(114);
    expect(r.totalMinor - r.gstMinor).toBe(1266);
  });

  it("W3 US-082 AC2 (P2): exclusive $4.50 + $3.20 -> GST $0.69, total $8.39", () => {
    const r = priceCheckout(
      oneStore([
        { id: "a", storeId: "stall-1", unitPriceMinor: 450, qty: 1 },
        { id: "b", storeId: "stall-1", unitPriceMinor: 320, qty: 1 },
      ]),
      EXCL,
    );
    expect(r.gstMinor).toBe(69);
    expect(r.totalMinor).toBe(839);
  });

  it("W4 US-082 AC3 (P3): inclusive $0.10 -> GST $0.01", () => {
    expect(gstFromInclusive(10, 900)).toBe(1);
  });

  it("W5 US-082 AC4 (P4): two $0.55 items at two stalls -> $0.05 + $0.05 = $0.10, not $0.09", () => {
    const r = priceCheckout(
      {
        orderType: "DINE_IN",
        stores: [S1, S2],
        lines: [
          { id: "a", storeId: "stall-1", unitPriceMinor: 55, qty: 1 },
          { id: "b", storeId: "stall-2", unitPriceMinor: 55, qty: 1 },
        ],
      },
      INCL,
    );
    expect(r.storeOrders.map((s) => s.gstMinor)).toEqual([5, 5]);
    expect(r.gstMinor).toBe(10);
    expect(gstFromInclusive(110, 900)).toBe(9); // the rejected checkout-level figure
  });

  it("W6 US-082 AC5 (P4a): stall A $8.20 + stall B $5.50 -> $0.68 + $0.45 = $1.13", () => {
    const r = priceCheckout(
      {
        orderType: "DINE_IN",
        stores: [S1, S2],
        lines: [
          { id: "a", storeId: "stall-1", unitPriceMinor: 820, qty: 1 },
          { id: "b", storeId: "stall-2", unitPriceMinor: 550, qty: 1 },
        ],
      },
      INCL,
    );
    expect(r.storeOrders.map((s) => s.gstMinor)).toEqual([68, 45]);
    expect(r.gstMinor).toBe(113);
    expect(r.totalMinor).toBe(1370);
  });

  it("W7 US-082 AC6 (P4b): one store order, two $0.55 lines -> store GST $0.09, lines $0.05 / $0.04", () => {
    const r = priceCheckout(
      oneStore([
        { id: "a", storeId: "stall-1", unitPriceMinor: 55, qty: 1 },
        { id: "b", storeId: "stall-1", unitPriceMinor: 55, qty: 1 },
      ]),
      INCL,
    );
    expect(r.gstMinor).toBe(9);
    expect(r.storeOrders[0]?.lines.map((l) => l.gstMinor)).toEqual([5, 4]);
  });

  it("W8 US-081 AC2 / D-133: exclusive 2 x $6.50 -> lines $13.00, GST $1.17, total $14.17 (not $14.18)", () => {
    const r = priceCheckout(oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 650, qty: 2 }]), EXCL);
    expect(r.storeOrders[0]?.itemsNetMinor).toBe(1300);
    expect(r.gstMinor).toBe(117);
    expect(r.totalMinor).toBe(1417);
    expect(gstOnExclusive(650, 900) * 2).toBe(118); // per-line rounding, rejected
  });
});

describe("ADR-009 worked examples — discounts and refunds", () => {
  it("W9 US-083 AC1 (P5): inclusive $10.00 - 10% -> taxable $9.00, GST $0.74", () => {
    const r = priceCheckout(
      oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 1000, qty: 1 }], {
        orderDiscount: { kind: "PERCENT", rateBp: 1000 },
      }),
      INCL,
    );
    expect(r.totalMinor).toBe(900);
    expect(r.gstMinor).toBe(74);
  });

  it("W10 US-083 AC2 (P12): partial refund GST = GST allocated to the line at sale", () => {
    const r = priceCheckout(
      oneStore(
        [
          { id: "a", storeId: "stall-1", unitPriceMinor: 650, qty: 1 },
          { id: "b", storeId: "stall-1", unitPriceMinor: 350, qty: 1 },
        ],
        { orderDiscount: { kind: "PERCENT", rateBp: 1000 } },
      ),
      INCL,
    );
    const [a, b] = r.storeOrders[0]?.lines ?? [];
    expect(a?.netMinor).toBe(585);
    expect(b?.netMinor).toBe(315);
    expect(r.gstMinor).toBe(74);
    expect([a?.gstMinor, b?.gstMinor]).toEqual([48, 26]);
    // Refund of line a: amount $5.85, GST $0.48; store net GST after refund = 74 - 48 = 26.
    expect(r.gstMinor - (a?.gstMinor ?? 0)).toBe(26);
  });

  it("W11 US-083 AC4 (P6): 100% discount -> total $0.00, GST $0.00", () => {
    const r = priceCheckout(
      oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 650, qty: 1 }], {
        orderDiscount: { kind: "PERCENT", rateBp: 10_000 },
      }),
      INCL,
    );
    expect(r.totalMinor).toBe(0);
    expect(r.gstMinor).toBe(0);
    expect(r.supervisorRequiredForDiscount).toBe(true);
  });

  it("W12 US-049 AC7 (P20): $0.01 off stall 1 $5.00 + stall 2 $5.00 -> $0.01 / $0.00 (tie to the store listed first)", () => {
    const r = priceCheckout(
      {
        orderType: "DINE_IN",
        stores: [S1, S2],
        lines: [
          { id: "a", storeId: "stall-1", unitPriceMinor: 500, qty: 1 },
          { id: "b", storeId: "stall-2", unitPriceMinor: 500, qty: 1 },
        ],
        orderDiscount: { kind: "AMOUNT", amountMinor: 1 },
      },
      INCL,
    );
    expect(r.storeOrders.map((s) => s.discountMinor)).toEqual([1, 0]);
  });

  it("W12b D-105: tie goes to the store first in the display order, not the store added first", () => {
    const r = priceCheckout(
      {
        orderType: "DINE_IN",
        stores: [S1, S2],
        lines: [
          { id: "b", storeId: "stall-2", unitPriceMinor: 500, qty: 1 },
          { id: "a", storeId: "stall-1", unitPriceMinor: 500, qty: 1 },
        ],
        orderDiscount: { kind: "AMOUNT", amountMinor: 1 },
      },
      INCL,
    );
    expect(r.storeOrders.map((s) => [s.storeId, s.discountMinor])).toEqual([
      ["stall-1", 1],
      ["stall-2", 0],
    ]);
  });

  it("W13 NA-28 / QA-M20 (P20a): $0.02 off, stall 1 $1.00 + $1.00, stall 2 $1.00 + $1.00 -> $0.01 per stall, first line", () => {
    const r = priceCheckout(
      {
        orderType: "DINE_IN",
        stores: [S1, S2],
        lines: [
          { id: "a1", storeId: "stall-1", unitPriceMinor: 100, qty: 1 },
          { id: "a2", storeId: "stall-1", unitPriceMinor: 100, qty: 1 },
          { id: "b1", storeId: "stall-2", unitPriceMinor: 100, qty: 1 },
          { id: "b2", storeId: "stall-2", unitPriceMinor: 100, qty: 1 },
        ],
        orderDiscount: { kind: "AMOUNT", amountMinor: 2 },
      },
      INCL,
    );
    expect(r.storeOrders.map((s) => s.discountMinor)).toEqual([1, 1]);
    expect(r.storeOrders.map((s) => s.lines.map((l) => l.orderDiscountMinor))).toEqual([
      [1, 0],
      [1, 0],
    ]);
    // Line-level allocation would give [2, 0] by store: that is the rejected rule.
    expect(allocateLargestRemainder(2, [100, 100, 100, 100])).toEqual([1, 1, 0, 0]);
  });

  it("W14 US-049 AC3 (P11): $2.00 on $10.00 = 20.0% no PIN; $2.01 = 20.1% PIN", () => {
    expect(discountNeedsSupervisor(200, 1000)).toBe(false);
    expect(discountNeedsSupervisor(201, 1000)).toBe(true);
  });

  it("W15 US-049 AC4 (P11a): 15% item + 10% order = 23.5% -> PIN; 10% + 10% = 19.0% -> no PIN", () => {
    const stacked = (itemBp: number) =>
      priceCheckout(
        oneStore(
          [
            {
              id: "a",
              storeId: "stall-1",
              unitPriceMinor: 1000,
              qty: 1,
              lineDiscount: { kind: "PERCENT", rateBp: itemBp },
            },
          ],
          { orderDiscount: { kind: "PERCENT", rateBp: 1000 } },
        ),
        INCL,
      );
    const a = stacked(1500);
    expect(a.totalMinor).toBe(765);
    expect(a.discountMinor).toBe(235);
    expect(a.supervisorRequiredForDiscount).toBe(true);
    const b = stacked(1000);
    expect(b.totalMinor).toBe(810);
    expect(b.supervisorRequiredForDiscount).toBe(false);
  });
});

describe("ADR-009 worked examples — container fees, modifiers, charges", () => {
  it("W16 US-032 AC1-AC3, AC5 (P7): per-item $0.30 x 2 and per-order $0.50 once per store, taxable", () => {
    const r = priceCheckout(
      {
        orderType: "TAKEAWAY",
        stores: [
          { storeId: "stall-1", containerFeePerOrderMinor: 50 },
          { storeId: "stall-2", containerFeePerOrderMinor: 50 },
        ],
        lines: [
          { id: "bowl", storeId: "stall-1", unitPriceMinor: 650, qty: 2, containerFeePerItemMinor: 30 },
          { id: "x", storeId: "stall-2", unitPriceMinor: 400, qty: 1 },
          { id: "y", storeId: "stall-2", unitPriceMinor: 300, qty: 1 },
        ],
      },
      INCL,
    );
    const [s1, s2] = r.storeOrders;
    expect(s1?.charges.map((c) => c.amountMinor)).toEqual([60, 50]);
    expect(s2?.charges.map((c) => c.amountMinor)).toEqual([50]);
    expect(s1?.totalMinor).toBe(1300 + 60 + 50);
    expect(s1?.gstMinor).toBe(gstFromInclusive(1410, 900));
    // Dine-in: no container fee (US-032 AC4, AC6).
    const dineIn = priceCheckout(
      {
        orderType: "DINE_IN",
        stores: [{ storeId: "stall-1", containerFeePerOrderMinor: 50 }],
        lines: [
          { id: "bowl", storeId: "stall-1", unitPriceMinor: 650, qty: 2, containerFeePerItemMinor: 30 },
        ],
      },
      INCL,
    );
    expect(dineIn.storeOrders[0]?.charges).toEqual([]);
  });

  it("W17 US-032 AC7 / US-049 AC8 (D-135 f): container fees are not discountable", () => {
    const tenPercent = priceCheckout(
      {
        orderType: "TAKEAWAY",
        stores: [S1],
        lines: [
          { id: "bowl", storeId: "stall-1", unitPriceMinor: 650, qty: 2, containerFeePerItemMinor: 30 },
        ],
        orderDiscount: { kind: "PERCENT", rateBp: 1000 },
      },
      INCL,
    );
    expect(tenPercent.discountMinor).toBe(130);
    expect(tenPercent.totalMinor).toBe(1230);
    const full = priceCheckout(
      {
        orderType: "TAKEAWAY",
        stores: [S1],
        lines: [
          { id: "bowl", storeId: "stall-1", unitPriceMinor: 650, qty: 2, containerFeePerItemMinor: 30 },
        ],
        orderDiscount: { kind: "PERCENT", rateBp: 10_000 },
      },
      INCL,
    );
    expect(full.totalMinor).toBe(60);
    const amount = priceCheckout(
      {
        orderType: "TAKEAWAY",
        stores: [{ storeId: "stall-1", containerFeePerOrderMinor: 50 }],
        lines: [{ id: "a", storeId: "stall-1", unitPriceMinor: 1000, qty: 1 }],
        orderDiscount: { kind: "AMOUNT", amountMinor: 200 },
      },
      INCL,
    );
    expect(amount.totalMinor).toBe(850);
    expect(amount.supervisorRequiredForDiscount).toBe(false); // $2.00 / $10.00 = 20.0%
  });

  it("W18 US-046 AC1 (P13): $6.50 + $0.50 modifier x 2 -> $14.00", () => {
    const r = priceCheckout(
      oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 650, modifierPricesMinor: [50], qty: 2 }]),
      INCL,
    );
    expect(r.totalMinor).toBe(1400);
  });

  it("W19 US-065 AC1-AC3, AC7 (P10): cash rounding map; NONE keeps $8.42; change due", () => {
    expect(cashDue(842, "NEAREST_5")).toEqual({ dueMinor: 840, roundingMinor: -2 });
    expect(cashDue(843, "NEAREST_5")).toEqual({ dueMinor: 845, roundingMinor: 2 });
    const map = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => cashDue(800 + d, "NEAREST_5").dueMinor);
    expect(map).toEqual([800, 800, 800, 805, 805, 805, 805, 805, 810, 810]);
    expect(cashDue(842, "NONE")).toEqual({ dueMinor: 842, roundingMinor: 0 });
    expect(changeDue(840, 1000)).toBe(160);
    expect(() => changeDue(840, 800)).toThrow();
  });

  it("W20 US-086 AC1 / US-087 AC1 (P8, v1.0.0): exclusive + SC 10% on $20.00 -> SC $2.00, GST $1.98, total $23.98", () => {
    const r = priceCheckout(oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 2000, qty: 1 }]), {
      ...EXCL,
      serviceChargeBp: 1000,
    });
    expect(r.storeOrders[0]?.serviceChargeMinor).toBe(200);
    expect(r.gstMinor).toBe(198);
    expect(r.totalMinor).toBe(2398);
  });

  it("W21 US-086 AC3 (P9, v1.0.0): SC on the discounted $18.00 -> SC $1.80, GST $1.78, total $21.58", () => {
    const r = priceCheckout(
      oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 2000, qty: 1 }], {
        orderDiscount: { kind: "PERCENT", rateBp: 1000 },
      }),
      { ...EXCL, serviceChargeBp: 1000 },
    );
    expect(r.storeOrders[0]?.serviceChargeMinor).toBe(180);
    expect(r.gstMinor).toBe(178);
    expect(r.totalMinor).toBe(2158);
  });

  it("W21b service charge with inclusive pricing is refused in MVP1 [proposal]", () => {
    expect(() =>
      priceCheckout(oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 2000, qty: 1 }]), {
        ...INCL,
        serviceChargeBp: 1000,
      }),
    ).toThrow(/exclusive/);
  });

  it("W22 US-063 AC2 (P17, v1.0.0): split $10.00 in 3 -> $3.34 / $3.33 / $3.33; GST $0.83 -> $0.28 / $0.28 / $0.27", () => {
    expect(splitEqually(1000, 3)).toEqual([334, 333, 333]);
    expect(gstFromInclusive(1000, 900)).toBe(83);
    expect(allocateLargestRemainder(83, [334, 333, 333])).toEqual([28, 28, 27]);
  });
});

describe("ADR-009 worked examples — fees, invoices, registration", () => {
  it("W23 US-010 AC1, AC4 (P18): fee on $8.50 net of a $3.00 refund = fee on $5.50", () => {
    const rate = 150; // illustrative 1.50%; the real rate is STYL commercial data (UC-144)
    const sale = gatewayFee(850, rate); // 12.75 -> 13
    const reduction = gatewayFeeReduction(850, 300, rate);
    expect(sale).toBe(13);
    expect(sale - reduction).toBe(gatewayFee(550, rate)); // 8.25 -> 8
    // Rule case: rounding the refund alone (0.45 -> 0) would leave 2c on an 80c net.
    expect(gatewayFee(110, rate)).toBe(2);
    expect(gatewayFeeReduction(110, 30, rate)).toBe(1);
    expect(gatewayFee(80, rate)).toBe(1);
  });

  it("W24 US-084 AC1, AC8 (P21): simplified tax invoice at $1,000.00, not at $1,000.01", () => {
    expect(isSimplifiedInvoiceAllowed(100_000)).toBe(true);
    expect(isSimplifiedInvoiceAllowed(100_001)).toBe(false);
  });

  it("W25 US-081 AC5: operator not GST-registered -> no GST", () => {
    const r = priceCheckout(oneStore([{ id: "a", storeId: "stall-1", unitPriceMinor: 1380, qty: 1 }]), {
      ...INCL,
      gstRegistered: false,
    });
    expect(r.gstMinor).toBe(0);
    expect(r.totalMinor).toBe(1380);
  });
});
