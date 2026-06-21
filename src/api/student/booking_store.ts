import type {
  BookingDayRecord,
  BookingPeriod,
  BookingRecord,
} from "./booking_types";

export type SessionCountInput = {
  bookingDayId: number;
  period: BookingPeriod;
  excludeBookingId?: number;
};

export type CreateBookingData = {
  studentNumber: number;
  bookingDayId: number;
  period: BookingPeriod;
};

export type UpdateBookingData = {
  bookingId: number;
  bookingDayId: number;
  period: BookingPeriod;
};

export interface BookingTransaction {
  lockBookingDay(bookingDayId: number): Promise<void>;
  lockBooking(bookingId: number, studentNumber: number): Promise<void>;
  findBookingDay(bookingDayId: number): Promise<BookingDayRecord | null>;
  findBookingByStudent(studentNumber: number): Promise<BookingRecord | null>;
  findBookingByIdForStudent(
    bookingId: number,
    studentNumber: number,
  ): Promise<BookingRecord | null>;
  countSessionBookings(input: SessionCountInput): Promise<number>;
  createBooking(data: CreateBookingData): Promise<BookingRecord>;
  updateBooking(data: UpdateBookingData): Promise<BookingRecord>;
  markStudentBooked(studentNumber: number): Promise<void>;
}

export interface BookingStore {
  transaction<T>(
    operation: (transaction: BookingTransaction) => Promise<T>,
  ): Promise<T>;
  isRetryableConflict(error: unknown): boolean;
  isUniqueConstraintError(error: unknown): boolean;
}
