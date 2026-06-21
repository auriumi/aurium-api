import {
  BOOKING_ERROR_CODES,
  type BookingError,
  type BookingErrorCode,
} from "./booking_errors";

const BOOKING_ERROR_STATUS: Record<BookingErrorCode, number> = {
  [BOOKING_ERROR_CODES.INVALID_STUDENT_ID]: 400,
  [BOOKING_ERROR_CODES.INVALID_BOOKING_ID]: 400,
  [BOOKING_ERROR_CODES.INVALID_BOOKING_DAY_ID]: 400,
  [BOOKING_ERROR_CODES.INVALID_PERIOD]: 400,
  [BOOKING_ERROR_CODES.BOOKING_DAY_NOT_FOUND]: 404,
  [BOOKING_ERROR_CODES.BOOKING_NOT_FOUND]: 404,
  [BOOKING_ERROR_CODES.BOOKING_DAY_CLOSED]: 409,
  [BOOKING_ERROR_CODES.BOOKING_DAY_IN_PAST]: 409,
  [BOOKING_ERROR_CODES.SESSION_FULL]: 409,
  [BOOKING_ERROR_CODES.DUPLICATE_BOOKING]: 409,
  [BOOKING_ERROR_CODES.CONCURRENT_BOOKING_CONFLICT]: 409,
};

export function bookingErrorStatus(code: BookingErrorCode) {
  return BOOKING_ERROR_STATUS[code];
}

export function bookingErrorResponse(error: BookingError) {
  return {
    status: "Failed",
    code: error.code,
    message: error.message,
  };
}
