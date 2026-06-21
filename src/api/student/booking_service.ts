import type { BookingStore } from "./booking_store";

export type CreateBookingInput = {
  studentNumber: unknown;
  bookingDayId: unknown;
  period: unknown;
};

export type UpdateBookingInput = CreateBookingInput & {
  bookingId: unknown;
};

export type BookingServiceOptions = {
  now?: () => Date;
  maxTransactionAttempts?: number;
};

export function createBookingService(
  store: BookingStore,
  options: BookingServiceOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const maxTransactionAttempts = options.maxTransactionAttempts ?? 3;

  return {
    now,
    maxTransactionAttempts,
  };
}
