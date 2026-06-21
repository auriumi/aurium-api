import {
  BOOKING_ERROR_CODES,
  BookingError,
  type BookingErrorCode,
} from "./booking_errors";
import {
  BOOKING_PERIODS,
  type BookingDayRecord,
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

export function isPastUtcDate(date: Date, now = new Date()) {
  const scheduleDate = new Date(date);
  scheduleDate.setUTCHours(0, 0, 0, 0);

  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  return scheduleDate < today;
}

export function capacityForPeriod(
  bookingDay: BookingDayRecord,
  period: BookingPeriod,
) {
  return period === "AM"
    ? bookingDay.max_morning_cap
    : bookingDay.max_afternoon_cap;
}

export function requireBookingDay(
  bookingDay: BookingDayRecord | null,
): BookingDayRecord {
  if (!bookingDay) {
    throw new BookingError(
      BOOKING_ERROR_CODES.BOOKING_DAY_NOT_FOUND,
      "The selected booking day does not exist.",
    );
  }

  return bookingDay;
}

export function requireOpenBookingDay(bookingDay: BookingDayRecord) {
  if (!bookingDay.is_open) {
    throw new BookingError(
      BOOKING_ERROR_CODES.BOOKING_DAY_CLOSED,
      "The selected booking day is closed.",
    );
  }
}

export function requireCurrentBookingDay(
  bookingDay: BookingDayRecord,
  now = new Date(),
) {
  if (isPastUtcDate(bookingDay.date, now)) {
    throw new BookingError(
      BOOKING_ERROR_CODES.BOOKING_DAY_IN_PAST,
      "The selected booking day has already passed.",
    );
  }
}
