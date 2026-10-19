import { describe, expect, it } from "vitest";
import { OrderNumber, parseEvent } from "../src/index.js";

const ids = {
  event: "0192c3e4-7a1b-7c2d-8e3f-1a2b3c4d5e6f",
  op: "0192c3e4-7a1b-7c2d-8e3f-000000000001",
  site: "0192c3e4-7a1b-7c2d-8e3f-000000000002",
  store: "0192c3e4-7a1b-7c2d-8e3f-000000000003",
  ticket: "0192c3e4-7a1b-7c2d-8e3f-000000000004",
  order: "0192c3e4-7a1b-7c2d-8e3f-000000000005",
};

describe("event contracts", () => {
  it("parses a ticket.ready envelope", () => {
    const e = parseEvent({
      eventId: ids.event,
      type: "ticket.ready",
      version: 1,
      channel: `site:${ids.site}:qms`,
      seq: 42,
      occurredAt: "2026-11-20T03:41:07.512Z",
      operatorId: ids.op,
      siteId: ids.site,
      data: {
        ticketId: ids.ticket,
        orderId: ids.order,
        orderNumber: "K012",
        storeId: ids.store,
        readyAt: "2026-11-20T03:41:07.000Z",
      },
    });
    expect(e.type).toBe("ticket.ready");
  });

  it("rejects a payload that breaks its schema", () => {
    expect(() =>
      parseEvent({
        eventId: ids.event,
        type: "ticket.ready",
        version: 1,
        channel: "x",
        seq: 1,
        occurredAt: "2026-11-20T03:41:07.512Z",
        operatorId: ids.op,
        siteId: ids.site,
        data: { orderNumber: "K012" },
      }),
    ).toThrow();
  });

  it("accepts the order-number formats of ADR-008", () => {
    for (const ok of ["K001", "Q017", "C101", "K1000", "CA001", "CB123"])
      expect(OrderNumber.safeParse(ok).success).toBe(true);
    for (const bad of ["K01", "X001", "CI001", "CK001", "C-001", "c001"])
      expect(OrderNumber.safeParse(bad).success).toBe(false);
  });
});
