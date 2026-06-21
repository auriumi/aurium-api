const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createBookingService,
} = require("../dist/api/student/booking_service.js");
const {
  BOOKING_ERROR_CODES,
} = require("../dist/api/student/booking_errors.js");
const {
  InMemoryBookingStore,
} = require("./booking_test_store.cjs");

const NOW = new Date("2026-06-21T08:00:00.000Z");

function bookingDay(overrides = {}) {
  return {
    id: 1,
    date: new Date("2026-06-22T00:00:00.000Z"),
    is_open: true,
    max_morning_cap: 2,
    max_afternoon_cap: 2,
    ...overrides,
  };
}

function createFixture(options = {}) {
  const store = new InMemoryBookingStore({
    bookingDays: options.bookingDays ?? [bookingDay()],
    bookings: options.bookings ?? [],
  });
  const service = createBookingService(store, {
    now: () => NOW,
  });

  return { service, store };
}

async function expectBookingError(promise, code) {
  await assert.rejects(
    promise,
    (error) => error?.code === code,
  );
}

test("rejects invalid booking periods", async () => {
  const { service } = createFixture();

  await expectBookingError(
    service.bookStudent({
      studentNumber: 20260001,
      bookingDayId: 1,
      period: "EVENING",
    }),
    BOOKING_ERROR_CODES.INVALID_PERIOD,
  );
});

test("rejects booking days that do not exist", async () => {
  const { service } = createFixture();

  await expectBookingError(
    service.bookStudent({
      studentNumber: 20260001,
      bookingDayId: 999,
      period: "AM",
    }),
    BOOKING_ERROR_CODES.BOOKING_DAY_NOT_FOUND,
  );
});
