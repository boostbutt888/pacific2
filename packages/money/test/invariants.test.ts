/**
 * Property checks (TEST_STRATEGY §3.1 P23, reduced to 2,000 seeded random carts in unit CI).
 * Invariants: checkout GST = sum of store-order GST; line + charge GST shares = store GST;
 * discount shares sum exactly; totals never negative; inclusive total = taxable.
 */
import { describe, expect, it } from "vitest";
import {
  MoneyError,
  allocateLargestRemainder,
  assertMinor,
  mulDivHalfUp,
  priceCheckout,
  type CheckoutInput,
  type TaxProfile,
} from "../src/index.js";

function rng(seed: number): () => number {
  // mulberry32: deterministic, so a failure is reproducible from its seed.
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function int(r: () => number, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1));
}

function randomCart(r: () => number): CheckoutInput {
  const storeCount = int(r, 1, 4);
  const stores = Array.from({ length: storeCount }, (_, i) => ({
    storeId: `s${i}`,
    containerFeePerOrderMinor: r() < 0.3 ? int(r, 10, 80) : 0,
  }));
  const lines = Array.from({ length: int(r, 1, 12) }, (_, i) => ({
    id: `l${i}`,
    storeId: `s${int(r, 0, storeCount - 1)}`,
    unitPriceMinor: int(r, 0, 2500),
    modifierPricesMinor: r() < 0.4 ? [int(r, 0, 150)] : [],
    qty: int(r, 1, 4),
    containerFeePerItemMinor: r() < 0.3 ? int(r, 10, 50) : 0,
    lineDiscount: r() < 0.2 ? ({ kind: "PERCENT", rateBp: int(r, 0, 5000) } as const) : undefined,
  }));
  return {
    orderType: r() < 0.5 ? "DINE_IN" : "TAKEAWAY",
    stores,
    lines,
    orderDiscount: r() < 0.3 ? { kind: "PERCENT", rateBp: int(r, 0, 10_000) } : undefined,
  };
}

describe("pricing invariants (P23)", () => {
  it("holds for 2,000 seeded random carts in both GST modes", () => {
    const r = rng(20261019);
    for (let n = 0; n < 2000; n++) {
      const cart = randomCart(r);
      const profile: TaxProfile = {
        priceMode: n % 2 === 0 ? "INCLUSIVE" : "EXCLUSIVE",
        gstRateBp: 900,
        gstRegistered: true,
        serviceChargeBp: n % 2 === 1 && n % 3 === 0 ? 1000 : 0,
      };
      const p = priceCheckout(cart, profile);
      expect(p.gstMinor).toBe(p.storeOrders.reduce((a, s) => a + s.gstMinor, 0));
      expect(p.totalMinor).toBe(p.storeOrders.reduce((a, s) => a + s.totalMinor, 0));
      for (const s of p.storeOrders) {
        const shares =
          s.lines.reduce((a, l) => a + l.gstMinor, 0) + s.charges.reduce((a, c) => a + c.gstMinor, 0);
        expect(shares).toBe(s.gstMinor);
        expect(s.totalMinor).toBeGreaterThanOrEqual(0);
        for (const l of s.lines) {
          expect(l.netMinor).toBe(l.grossMinor - l.lineDiscountMinor - l.orderDiscountMinor);
          expect(l.netMinor).toBeGreaterThanOrEqual(0);
          assertMinor(l.gstMinor);
        }
        if (profile.priceMode === "INCLUSIVE") expect(s.totalMinor).toBe(s.taxableMinor);
        else expect(s.totalMinor).toBe(s.taxableMinor + s.gstMinor);
      }
      if (cart.orderDiscount) {
        const lineDiscounts = p.storeOrders
          .flatMap((s) => s.lines)
          .reduce((a, l) => a + l.lineDiscountMinor, 0);
        const orderShares = p.storeOrders
          .flatMap((s) => s.lines)
          .reduce((a, l) => a + l.orderDiscountMinor, 0);
        expect(lineDiscounts + orderShares).toBe(p.discountMinor);
      }
    }
  });
});

describe("rounding and allocation primitives", () => {
  it("rounds exactly half up", () => {
    expect(mulDivHalfUp(1, 1, 2)).toBe(1);
    expect(mulDivHalfUp(1, 1, 3)).toBe(0);
    expect(mulDivHalfUp(2, 1, 3)).toBe(1);
  });

  it("allocation always sums to the total and gives ties to the first listed", () => {
    expect(allocateLargestRemainder(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocateLargestRemainder(0, [0, 0])).toEqual([0, 0]);
    expect(() => allocateLargestRemainder(5, [0, 0])).toThrow(MoneyError);
  });

  it("rejects floats and negative amounts", () => {
    expect(() => assertMinor(1.5)).toThrow(MoneyError);
    expect(() =>
      priceCheckout(
        {
          orderType: "DINE_IN",
          stores: [{ storeId: "s" }],
          lines: [{ id: "a", storeId: "s", unitPriceMinor: 6.5, qty: 1 }],
        },
        { priceMode: "INCLUSIVE", gstRateBp: 900, gstRegistered: true },
      ),
    ).toThrow(MoneyError);
  });

  it("refuses a discount above its base (US-049 AC5)", () => {
    expect(() =>
      priceCheckout(
        {
          orderType: "DINE_IN",
          stores: [{ storeId: "s" }],
          lines: [{ id: "a", storeId: "s", unitPriceMinor: 500, qty: 1 }],
          orderDiscount: { kind: "AMOUNT", amountMinor: 501 },
        },
        { priceMode: "INCLUSIVE", gstRateBp: 900, gstRegistered: true },
      ),
    ).toThrow(/DISCOUNT|exceeds/);
  });
});
