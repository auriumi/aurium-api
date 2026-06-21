import {
  BOOKING_ERROR_CODES,
  BookingError,
  type BookingErrorCode,
} from "./booking_errors";

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
