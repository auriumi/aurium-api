import {
  BOOKING_ERROR_CODES,
  BookingError,
  type BookingErrorCode,
} from "./booking_errors";
import {
  BOOKING_PERIODS,
  type BookingPeriod,
} from "./booking_types";

export function requirePositiveInteger(
  value: unknown,
  code: BookingErrorCode,
  label: string,
) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BookingError(code, `${label} must be a positive integer.`);
  }

  return parsed;
}

export function requireStudentNumber(value: unknown) {
  return requirePositiveInteger(
    value,
    BOOKING_ERROR_CODES.INVALID_STUDENT_ID,
    "Student number",
  );
}

export function requireBookingId(value: unknown) {
  return requirePositiveInteger(
    value,
    BOOKING_ERROR_CODES.INVALID_BOOKING_ID,
    "Booking ID",
  );
}

export function requireBookingDayId(value: unknown) {
  return requirePositiveInteger(
    value,
    BOOKING_ERROR_CODES.INVALID_BOOKING_DAY_ID,
    "Booking day ID",
  );
}

export function requireBookingPeriod(value: unknown): BookingPeriod {
  if (
    typeof value !== "string"
    || !BOOKING_PERIODS.includes(value as BookingPeriod)
  ) {
    throw new BookingError(
      BOOKING_ERROR_CODES.INVALID_PERIOD,
      "Period must be AM or PM.",
    );
  }

  return value as BookingPeriod;
}
