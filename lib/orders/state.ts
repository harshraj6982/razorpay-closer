import { OrderStatus } from "@prisma/client";

export const ORDER_STATUSES: OrderStatus[] = [
  "NEW",
  "QUALIFIED",
  "QUOTE_CREATED",
  "PAYMENT_REQUESTED",
  "PARTIALLY_PAID",
  "PAID",
  "FULFILLED",
];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ["QUALIFIED"],
  QUALIFIED: ["QUOTE_CREATED"],
  QUOTE_CREATED: ["PAYMENT_REQUESTED"],
  PAYMENT_REQUESTED: ["PARTIALLY_PAID", "PAID"],
  PARTIALLY_PAID: ["PAID", "PAYMENT_REQUESTED"],
  PAID: ["FULFILLED"],
  FULFILLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid order transition: ${from} → ${to}`);
  }
}

export function statusLabel(status: OrderStatus) {
  return status.replaceAll("_", " ");
}
