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
    retryFailures: options.retryFailures ?? 0,
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

test("rejects closed booking days", async () => {
  const { service } = createFixture({
    bookingDays: [bookingDay({ is_open: false })],
  });

  await expectBookingError(
    service.bookStudent({
      studentNumber: 20260001,
      bookingDayId: 1,
      period: "AM",
    }),
    BOOKING_ERROR_CODES.BOOKING_DAY_CLOSED,
  );
});

test("rejects past booking days", async () => {
  const { service } = createFixture({
    bookingDays: [
      bookingDay({ date: new Date("2026-06-20T00:00:00.000Z") }),
    ],
  });

  await expectBookingError(
    service.bookStudent({
      studentNumber: 20260001,
      bookingDayId: 1,
      period: "AM",
    }),
    BOOKING_ERROR_CODES.BOOKING_DAY_IN_PAST,
  );
});

test("rejects sessions at capacity", async () => {
  const { service } = createFixture({
    bookingDays: [bookingDay({ max_morning_cap: 1 })],
    bookings: [{
      id: 1,
      student_number: 20260000,
      booking_day_id: 1,
      period: "AM",
      created_at: NOW,
    }],
  });

  await expectBookingError(
    service.bookStudent({
      studentNumber: 20260001,
      bookingDayId: 1,
      period: "AM",
    }),
    BOOKING_ERROR_CODES.SESSION_FULL,
  );
});

test("rejects duplicate active bookings for a student", async () => {
  const { service } = createFixture({
    bookings: [{
      id: 1,
      student_number: 20260001,
      booking_day_id: 1,
      period: "PM",
      created_at: NOW,
    }],
  });

  await expectBookingError(
    service.bookStudent({
      studentNumber: 20260001,
      bookingDayId: 1,
      period: "AM",
    }),
    BOOKING_ERROR_CODES.DUPLICATE_BOOKING,
  );
});

test("creates a booking and marks the student booked atomically", async () => {
  const { service, store } = createFixture();

  const booking = await service.bookStudent({
    studentNumber: 20260001,
    bookingDayId: 1,
    period: "PM",
  });

  assert.equal(booking.student_number, 20260001);
  assert.equal(booking.booking_day_id, 1);
  assert.equal(booking.period, "PM");
  assert.equal(store.bookings.length, 1);
  assert.equal(store.studentStatuses.get(20260001), "BOOKED");
});

test("serializes concurrent requests so capacity cannot be exceeded", async () => {
  const { service, store } = createFixture({
    bookingDays: [bookingDay({ max_morning_cap: 1 })],
  });

  const results = await Promise.allSettled([
    service.bookStudent({
      studentNumber: 20260001,
      bookingDayId: 1,
      period: "AM",
    }),
    service.bookStudent({
      studentNumber: 20260002,
      bookingDayId: 1,
      period: "AM",
    }),
  ]);

  const successful = results.filter(({ status }) => status === "fulfilled");
  const rejected = results.filter(({ status }) => status === "rejected");

  assert.equal(successful.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, BOOKING_ERROR_CODES.SESSION_FULL);
  assert.equal(store.bookings.length, 1);
});

test("updates an owned booking to an available session", async () => {
  const existingBooking = {
    id: 10,
    student_number: 20260001,
    booking_day_id: 1,
    period: "AM",
    created_at: NOW,
  };
  const { service, store } = createFixture({
    bookingDays: [
      bookingDay(),
      bookingDay({
        id: 2,
        date: new Date("2026-06-23T00:00:00.000Z"),
      }),
    ],
    bookings: [existingBooking],
  });

  const updated = await service.changeBooking({
    bookingId: 10,
    studentNumber: 20260001,
    bookingDayId: 2,
    period: "PM",
  });

  assert.equal(updated.booking_day_id, 2);
  assert.equal(updated.period, "PM");
  assert.equal(store.bookings.length, 1);
});

test("keeps the original booking when the target session is full", async () => {
  const { service, store } = createFixture({
    bookingDays: [
      bookingDay(),
      bookingDay({
        id: 2,
        max_afternoon_cap: 1,
        date: new Date("2026-06-23T00:00:00.000Z"),
      }),
    ],
    bookings: [
      {
        id: 10,
        student_number: 20260001,
        booking_day_id: 1,
        period: "AM",
        created_at: NOW,
      },
      {
        id: 11,
        student_number: 20260002,
        booking_day_id: 2,
        period: "PM",
        created_at: NOW,
      },
    ],
  });

  await expectBookingError(
    service.changeBooking({
      bookingId: 10,
      studentNumber: 20260001,
      bookingDayId: 2,
      period: "PM",
    }),
    BOOKING_ERROR_CODES.SESSION_FULL,
  );

  const unchanged = store.bookings.find(({ id }) => id === 10);
  assert.equal(unchanged.booking_day_id, 1);
  assert.equal(unchanged.period, "AM");
});

test("rejects updates to another student's booking", async () => {
  const { service } = createFixture({
    bookings: [{
      id: 10,
      student_number: 20260001,
      booking_day_id: 1,
      period: "AM",
      created_at: NOW,
    }],
  });

  await expectBookingError(
    service.changeBooking({
      bookingId: 10,
      studentNumber: 20260002,
      bookingDayId: 1,
      period: "PM",
    }),
    BOOKING_ERROR_CODES.BOOKING_NOT_FOUND,
  );
});

test("retries transient serialization conflicts", async () => {
  const { service, store } = createFixture({
    retryFailures: 2,
  });

  await service.bookStudent({
    studentNumber: 20260001,
    bookingDayId: 1,
    period: "AM",
  });

  assert.equal(store.bookings.length, 1);
  assert.equal(store.retryFailures, 0);
});

test("returns a conflict after transaction retries are exhausted", async () => {
  const { service } = createFixture({
    retryFailures: 3,
  });

  await expectBookingError(
    service.bookStudent({
      studentNumber: 20260001,
      bookingDayId: 1,
      period: "AM",
    }),
    BOOKING_ERROR_CODES.CONCURRENT_BOOKING_CONFLICT,
  );
});

test("does not count the current booking against an update", async () => {
  const { service } = createFixture({
    bookingDays: [bookingDay({ max_morning_cap: 1 })],
    bookings: [{
      id: 10,
      student_number: 20260001,
      booking_day_id: 1,
      period: "AM",
      created_at: NOW,
    }],
  });

  const updated = await service.changeBooking({
    bookingId: 10,
    studentNumber: 20260001,
    bookingDayId: 1,
    period: "AM",
  });

  assert.equal(updated.booking_day_id, 1);
  assert.equal(updated.period, "AM");
});
