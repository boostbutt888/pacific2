/**
 * Real-time event contracts (API.md §4; ADR-003). Every event travels in one envelope,
 * delivered at-least-once and ordered per channel; consumers deduplicate by `eventId`
 * and resync with GET /v1/sync on a `seq` gap.
 */
import { z } from "zod";
import { Channel, MinorAmount, OrderNumber, OrderStatus, PaymentMode, Tender, Uuid } from "./domain.js";

export const LocalizedText = z.object({ en: z.string(), "zh-Hans": z.string().optional() });

export const EventEnvelope = z.object({
  eventId: Uuid,
  type: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  version: z.number().int().positive(),
  channel: z.string().min(1),
  seq: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  operatorId: Uuid,
  siteId: Uuid,
  storeId: Uuid.optional(),
  /** Idempotency-Key of the request that caused the event. */
  causationId: z.string().optional(),
  data: z.unknown(),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;

const OrderRef = z.object({ orderId: Uuid, storeId: Uuid });

export const OrderPlaced = z.object({
  checkoutId: Uuid,
  orderNumber: OrderNumber,
  channel: Channel,
  paymentMode: PaymentMode,
  orders: z.array(OrderRef.extend({ totalMinor: MinorAmount })).min(1),
  totalMinor: MinorAmount,
});

export const OrderPaid = z.object({
  checkoutId: Uuid,
  orderNumber: OrderNumber,
  paymentId: Uuid,
  tender: Tender,
  amountMinor: MinorAmount,
  orders: z.array(OrderRef).min(1),
});

export const TicketLine = z.object({
  lineId: Uuid,
  name: LocalizedText,
  qty: z.number().int().positive(),
  modifiers: z.array(LocalizedText),
  notes: z.string().optional(),
});

export const TicketCreated = z.object({
  ticketId: Uuid,
  orderId: Uuid,
  orderNumber: OrderNumber,
  storeId: Uuid,
  stationId: Uuid.optional(),
  channel: Channel,
  orderType: z.enum(["DINE_IN", "TAKEAWAY"]),
  lines: z.array(TicketLine).min(1),
  paidAt: z.string().datetime(),
  kotPrinted: z.boolean(),
});

export const TicketBumped = z.object({
  ticketId: Uuid,
  orderId: Uuid,
  lineIds: z.array(Uuid).optional(),
  bumpedBy: Uuid,
  at: z.string().datetime(),
});

export const TicketReady = z.object({
  ticketId: Uuid,
  orderId: Uuid,
  orderNumber: OrderNumber,
  storeId: Uuid,
  readyAt: z.string().datetime(),
});

export const OrderCollected = z.object({
  orderId: Uuid,
  ticketId: Uuid.optional(),
  orderNumber: OrderNumber,
  storeId: Uuid,
  by: Uuid,
  at: z.string().datetime(),
  /** True when the action was queued offline on a POS (D-103). */
  queuedOffline: z.boolean(),
});

export const OrderStatusChanged = z.object({
  orderId: Uuid,
  checkoutId: Uuid,
  orderNumber: OrderNumber,
  storeId: Uuid,
  from: OrderStatus,
  to: OrderStatus,
});

export const ItemSoldOut = z.object({
  storeId: Uuid,
  itemId: Uuid,
  by: Uuid.optional(),
  stockCount: z.number().int().optional(),
  reason: z.enum(["MANUAL", "COUNT_ZERO"]),
});

/** Event registry: type -> payload schema (version 1). */
export const EVENT_PAYLOADS = {
  "order.placed": OrderPlaced,
  "order.paid": OrderPaid,
  "ticket.created": TicketCreated,
  "ticket.bumped": TicketBumped,
  "ticket.ready": TicketReady,
  "order.collected": OrderCollected,
  "order.status_changed": OrderStatusChanged,
  "item.sold_out": ItemSoldOut,
} as const;

export type KnownEventType = keyof typeof EVENT_PAYLOADS;

/** Parses an envelope and its payload; unknown types pass with `data` untyped (forward compatibility). */
export function parseEvent(raw: unknown) {
  const envelope = EventEnvelope.parse(raw);
  const schema = (EVENT_PAYLOADS as Record<string, z.ZodTypeAny | undefined>)[envelope.type];
  return { ...envelope, data: schema ? schema.parse(envelope.data) : envelope.data };
}
