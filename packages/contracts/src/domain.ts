/**
 * Shared domain enums and identifiers (DATA_MODEL.md; API.md §1). Types only, no behaviour.
 */
import { z } from "zod";

/** UUIDv7 (time-ordered). Client-generated for checkout / order / payment so offline replay is idempotent (ADR-007 §4). */
export const Uuid = z.string().uuid();
export type Uuid = z.infer<typeof Uuid>;

/** Integer minor units (cents). Never a float (ADR-009 §2). */
export const MinorAmount = z.number().int().safe();
export const Currency = z.enum(["SGD"]); // MVP1 ships SGD only (D-071); the schema accepts more later.

export const Channel = z.enum(["POS", "SOK", "QR"]);
export type Channel = z.infer<typeof Channel>;

/** Order-number prefix per channel (D-022, ADR-008). */
export const ORDER_PREFIX: Record<Channel, "C" | "K" | "Q"> = { POS: "C", SOK: "K", QR: "Q" };

/**
 * Display order number (ADR-008 §6): prefix + at least 3 digits (K001, K1000), or the offline
 * overflow form prefix + till letter + 3 digits (CA001) when a POS block is exhausted offline (ADR-008 §8).
 */
export const OrderNumber = z.string().regex(/^[CKQ](\d{3,}|[ABD-HJLMNPR-Z]\d{3})$/);

export const OrderType = z.enum(["DINE_IN", "TAKEAWAY"]);
export const PaymentMode = z.enum(["PAY_NOW", "PAY_AT_COUNTER"]);

/** CONTEXT §7.7 order lifecycle, DATA_MODEL §4.2. */
export const OrderStatus = z.enum([
  "PLACED",
  "AWAITING_PAYMENT",
  "PAID",
  "IN_KITCHEN",
  "READY_PARTIAL",
  "READY",
  "COMPLETED",
  "CLOSED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED_PARTIAL",
  "REFUNDED",
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const TicketStatus = z.enum(["NEW", "IN_PREP", "READY", "COLLECTED", "CANCELLED"]);

export const Tender = z.enum(["CASH", "EXTERNAL_CARD", "EXTERNAL_NETS", "PAYNOW", "CARD", "NETS", "SUBSIDY"]);
export type Tender = z.infer<typeof Tender>;

export const PaymentStatus = z.enum(["PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED", "UNCLAIMED"]);

/** Store kitchen routing (D-083, D-119, US-324). */
export const RoutingMode = z.enum(["OWN_KDS", "SHARED_KDS", "PRINTER_ONLY", "GRAB_AND_GO"]);

export const DeviceRole = z.enum(["POS", "SOK", "KDS", "QMS"]);
export const TerminalMode = z.enum(["INTEGRATED", "STANDALONE", "NONE"]);

/** D-037 roles; platform roles are separate (ADR-010). */
export const StaffRole = z.enum([
  "CASHIER",
  "SUPERVISOR",
  "STORE_MANAGER",
  "KITCHEN",
  "RUNNER",
  "OPERATOR_ADMIN",
]);
export const PlatformRole = z.enum(["SUPER_ADMIN", "SUPPORT"]);

/** CONTEXT §4.1 Supervisor PIN overrides (D-037) + D-093 / D-095 / D-103 actions. */
export const OverrideAction = z.enum([
  "VOID_AFTER_SEND",
  "REFUND",
  "DISCOUNT_ABOVE_THRESHOLD",
  "OPEN_DRAWER_NO_SALE",
  "PRICE_OVERRIDE",
  "CANCEL_AFTER_START",
  "RELEASE_UNCLAIMED",
  "LINK_UNCLAIMED",
  "LINE_REFUND_CANNOT_MAKE",
  "REOPEN_COLLECTED",
  "SECOND_TENDER",
  "DRAWER_VARIANCE",
  "MANUAL_MEMBER_ID",
]);
