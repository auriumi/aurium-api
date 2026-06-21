import type {
  BookingStore,
  BookingTransaction,
} from "./booking_store";
import {
  BOOKING_ERROR_CODES,
  BookingError,
} from "./booking_errors";
import {
  requireBookingDayId,
  requireBookingPeriod,
  requireStudentNumber,
} from "./booking_policy";
import type { BookingPeriod } from "./booking_types";

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

type NormalizedCreateBookingInput = {
  studentNumber: number;
  bookingDayId: number;
  period: BookingPeriod;
};

export function normalizeCreateBookingInput(
  input: CreateBookingInput,
): NormalizedCreateBookingInput {
  return {
    studentNumber: requireStudentNumber(input.studentNumber),
    bookingDayId: requireBookingDayId(input.bookingDayId),
    period: requireBookingPeriod(input.period),
  };
}

export function createBookingService(
  store: BookingStore,
  options: BookingServiceOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const maxTransactionAttempts = options.maxTransactionAttempts ?? 3;

  async function runTransaction<T>(
    operation: (transaction: BookingTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxTransactionAttempts; attempt += 1) {
      try {
        return await store.transaction(operation);
      } catch (error) {
        if (!store.isRetryableConflict(error)) {
          throw error;
        }
      }
    }

    throw new BookingError(
      BOOKING_ERROR_CODES.CONCURRENT_BOOKING_CONFLICT,
      "The booking changed during this request. Please try again.",
    );
  }

  return {
    now,
    maxTransactionAttempts,
    runTransaction,
  };
}
