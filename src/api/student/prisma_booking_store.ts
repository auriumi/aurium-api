import {
  Prisma,
  StudentStatus,
} from "@prisma/client";
import prisma from "../../config/prisma";
import type {
  BookingStore,
  BookingTransaction,
} from "./booking_store";

function createTransaction(
  client: Prisma.TransactionClient,
): BookingTransaction {
  return {
    async lockBookingDay(bookingDayId) {
      await client.$queryRaw(
        Prisma.sql`
          SELECT "id"
          FROM "BookingDay"
          WHERE "id" = ${bookingDayId}
          FOR UPDATE
        `,
      );
    },

    async lockBooking(bookingId, studentNumber) {
      await client.$queryRaw(
        Prisma.sql`
          SELECT "id"
          FROM "Booking"
          WHERE "id" = ${bookingId}
            AND "student_number" = ${studentNumber}
          FOR UPDATE
        `,
      );
    },

    findBookingDay(bookingDayId) {
      return client.bookingDay.findUnique({
        where: { id: bookingDayId },
      });
    },

    findBookingByStudent(studentNumber) {
      return client.booking.findFirst({
        where: { student_number: studentNumber },
      });
    },

    findBookingByIdForStudent(bookingId, studentNumber) {
      return client.booking.findFirst({
        where: {
          id: bookingId,
          student_number: studentNumber,
        },
      });
    },

    countSessionBookings(input) {
      return client.booking.count({
        where: {
          booking_day_id: input.bookingDayId,
          period: input.period,
          ...(input.excludeBookingId === undefined
            ? {}
            : { id: { not: input.excludeBookingId } }),
        },
      });
    },

    createBooking(data) {
      return client.booking.create({
        data: {
          student_number: data.studentNumber,
          booking_day_id: data.bookingDayId,
          period: data.period,
        },
      });
    },

    updateBooking(data) {
      return client.booking.update({
        where: { id: data.bookingId },
        data: {
          booking_day_id: data.bookingDayId,
          period: data.period,
        },
      });
    },

    async markStudentBooked(studentNumber) {
      await client.studentAuth.update({
        where: { student_number: studentNumber },
        data: { status: StudentStatus.BOOKED },
      });
    },
  };
}

export const prismaBookingStore: BookingStore = {
  transaction(operation) {
    return prisma.$transaction(
      (client) => operation(createTransaction(client)),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  },

  isRetryableConflict(error) {
    return error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2034";
  },

  isUniqueConstraintError(error) {
    return error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002";
  },
};
