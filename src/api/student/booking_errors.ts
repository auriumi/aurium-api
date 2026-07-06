export const BOOKING_ERROR_CODES = {
  INVALID_STUDENT_ID: "INVALID_STUDENT_ID",
  INVALID_BOOKING_ID: "INVALID_BOOKING_ID",
  INVALID_BOOKING_DAY_ID: "INVALID_BOOKING_DAY_ID",
  INVALID_PERIOD: "INVALID_PERIOD",
  BOOKING_DAY_NOT_FOUND: "BOOKING_DAY_NOT_FOUND",
  BOOKING_DAY_CLOSED: "BOOKING_DAY_CLOSED",
  BOOKING_DAY_IN_PAST: "BOOKING_DAY_IN_PAST",
  SESSION_FULL: "SESSION_FULL",
  DUPLICATE_BOOKING: "DUPLICATE_BOOKING",
  BOOKING_NOT_FOUND: "BOOKING_NOT_FOUND",
  CONCURRENT_BOOKING_CONFLICT: "CONCURRENT_BOOKING_CONFLICT",
} as const;

export type BookingErrorCode =
  (typeof BOOKING_ERROR_CODES)[keyof typeof BOOKING_ERROR_CODES];

export class BookingError extends Error {
  readonly code: BookingErrorCode;

  constructor(code: BookingErrorCode, message: string) {
    super(message);
    this.name = "BookingError";
    this.code = code;
  }
}

export function isBookingError(error: unknown): error is BookingError {
  return error instanceof BookingError;
}
