class InMemoryBookingStore {
  constructor({
    bookingDays = [],
    bookings = [],
    retryFailures = 0,
  } = {}) {
    this.bookingDays = new Map(
      bookingDays.map((bookingDay) => [bookingDay.id, { ...bookingDay }]),
    );
    this.bookings = bookings.map((booking) => ({ ...booking }));
    this.studentStatuses = new Map();
    this.nextBookingId = Math.max(0, ...this.bookings.map(({ id }) => id)) + 1;
    this.transactionTail = Promise.resolve();
    this.retryFailures = retryFailures;
  }

  async transaction(operation) {
    const previousTransaction = this.transactionTail;
    let releaseTransaction;
    this.transactionTail = new Promise((resolve) => {
      releaseTransaction = resolve;
    });

    await previousTransaction;

    if (this.retryFailures > 0) {
      this.retryFailures -= 1;
      releaseTransaction();
      throw Object.assign(new Error("Serialization conflict"), {
        code: "RETRY",
      });
    }

    const snapshot = this.snapshot();

    try {
      return await operation(this.createTransaction());
    } catch (error) {
      this.restore(snapshot);
      throw error;
    } finally {
      releaseTransaction();
    }
  }

  isRetryableConflict(error) {
    return error?.code === "RETRY";
  }

  isUniqueConstraintError(error) {
    return error?.code === "UNIQUE";
  }

  createTransaction() {
    return {
      lockBookingDay: async () => {},
      lockBooking: async () => {},

      findBookingDay: async (bookingDayId) => {
        const bookingDay = this.bookingDays.get(bookingDayId);
        return bookingDay ? { ...bookingDay } : null;
      },

      findBookingByStudent: async (studentNumber) => {
        return this.bookings.find(
          (booking) => booking.student_number === studentNumber,
        ) ?? null;
      },

      findBookingByIdForStudent: async (bookingId, studentNumber) => {
        return this.bookings.find(
          (booking) => (
            booking.id === bookingId
            && booking.student_number === studentNumber
          ),
        ) ?? null;
      },

      countSessionBookings: async ({
        bookingDayId,
        period,
        excludeBookingId,
      }) => {
        return this.bookings.filter((booking) => (
          booking.booking_day_id === bookingDayId
          && booking.period === period
          && booking.id !== excludeBookingId
        )).length;
      },

      createBooking: async ({ studentNumber, bookingDayId, period }) => {
        if (
          this.bookings.some(
            (booking) => booking.student_number === studentNumber,
          )
        ) {
          throw Object.assign(new Error("Duplicate booking"), {
            code: "UNIQUE",
          });
        }

        const booking = {
          id: this.nextBookingId,
          student_number: studentNumber,
          booking_day_id: bookingDayId,
          period,
          created_at: new Date(),
        };
        this.nextBookingId += 1;
        this.bookings.push(booking);
        return { ...booking };
      },

      updateBooking: async ({ bookingId, bookingDayId, period }) => {
        const booking = this.bookings.find(({ id }) => id === bookingId);
        if (!booking) throw new Error("Booking disappeared");
        booking.booking_day_id = bookingDayId;
        booking.period = period;
        return { ...booking };
      },

      markStudentBooked: async (studentNumber) => {
        this.studentStatuses.set(studentNumber, "BOOKED");
      },
    };
  }

  snapshot() {
    return {
      bookings: this.bookings.map((booking) => ({ ...booking })),
      nextBookingId: this.nextBookingId,
      studentStatuses: new Map(this.studentStatuses),
    };
  }

  restore(snapshot) {
    this.bookings = snapshot.bookings;
    this.nextBookingId = snapshot.nextBookingId;
    this.studentStatuses = snapshot.studentStatuses;
  }
}

module.exports = {
  InMemoryBookingStore,
};
