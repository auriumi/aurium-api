const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BOOKING_ERROR_CODES,
  BookingError,
} = require("../dist/api/student/booking_errors.js");
const {
  bookingErrorResponse,
  bookingErrorStatus,
} = require("../dist/api/student/booking_http.js");

test("maps invalid booking requests to 400 responses", () => {
  assert.equal(
    bookingErrorStatus(BOOKING_ERROR_CODES.INVALID_PERIOD),
    400,
  );
  assert.equal(
    bookingErrorStatus(BOOKING_ERROR_CODES.INVALID_BOOKING_DAY_ID),
    400,
  );
});

test("maps unavailable booking state to conflict responses", () => {
  assert.equal(
    bookingErrorStatus(BOOKING_ERROR_CODES.BOOKING_DAY_CLOSED),
    409,
  );
  assert.equal(
    bookingErrorStatus(BOOKING_ERROR_CODES.SESSION_FULL),
    409,
  );
  assert.equal(
    bookingErrorStatus(BOOKING_ERROR_CODES.DUPLICATE_BOOKING),
    409,
  );
});

test("includes stable error codes in controller payloads", () => {
  const error = new BookingError(
    BOOKING_ERROR_CODES.SESSION_FULL,
    "The selected AM session is full.",
  );

  assert.deepEqual(bookingErrorResponse(error), {
    status: "Failed",
    code: BOOKING_ERROR_CODES.SESSION_FULL,
    message: "The selected AM session is full.",
  });
});
