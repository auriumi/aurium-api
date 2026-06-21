import type {
  BookingStore,
  BookingTransaction,
} from "./booking_store";
import {
  BOOKING_ERROR_CODES,
  BookingError,
} from "./booking_errors";
import {
  requireAvailableCapacity,
  requireBookableDay,
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

  async function loadBookableDay(
    transaction: BookingTransaction,
    bookingDayId: number,
  ) {
    await transaction.lockBookingDay(bookingDayId);
    const bookingDay = await transaction.findBookingDay(bookingDayId);
    return requireBookableDay(bookingDay, now());
  }

  async function requireNoExistingBooking(
    transaction: BookingTransaction,
    studentNumber: number,
  ) {
    const existingBooking = await transaction.findBookingByStudent(studentNumber);

    if (existingBooking) {
      throw new BookingError(
        BOOKING_ERROR_CODES.DUPLICATE_BOOKING,
        "This student already has an active booking.",
      );
    }
  }

  async function requireSessionSpace(
    transaction: BookingTransaction,
    bookingDayId: number,
    period: BookingPeriod,
    bookingDay: Awaited<ReturnType<typeof loadBookableDay>>,
    excludeBookingId?: number,
  ) {
    const bookedCount = await transaction.countSessionBookings({
      bookingDayId,
      period,
      ...(excludeBookingId === undefined ? {} : { excludeBookingId }),
    });

    requireAvailableCapacity(bookingDay, period, bookedCount);
  }

  async function bookStudent(input: CreateBookingInput) {
    const normalized = normalizeCreateBookingInput(input);

    return runTransaction(async (transaction) => {
      const bookingDay = await loadBookableDay(
        transaction,
        normalized.bookingDayId,
      );
      await requireNoExistingBooking(transaction, normalized.studentNumber);
      await requireSessionSpace(
        transaction,
        normalized.bookingDayId,
        normalized.period,
        bookingDay,
      );

      const booking = await transaction.createBooking(normalized);
      await transaction.markStudentBooked(normalized.studentNumber);
      return booking;
    });
  }

  return {
    bookStudent,
    now,
    maxTransactionAttempts,
    loadBookableDay,
    requireNoExistingBooking,
    requireSessionSpace,
    runTransaction,
  };
}
