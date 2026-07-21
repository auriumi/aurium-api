export type BookingPeriod = "AM" | "PM";

type SlotTemplate = {
  period: BookingPeriod;
  start_time: string;
  end_time: string;
};

export type BookingSlotData = SlotTemplate & {
  booking_day_id: number;
  capacity: number;
  is_open: boolean;
};

export const BOOKING_SLOT_WINDOWS: Record<BookingPeriod, SlotTemplate[]> = {
  AM: [
    { period: "AM", start_time: "08:00", end_time: "09:00" },
    { period: "AM", start_time: "09:00", end_time: "10:00" },
    { period: "AM", start_time: "10:00", end_time: "11:00" },
    { period: "AM", start_time: "11:00", end_time: "12:00" },
  ],
  PM: [
    { period: "PM", start_time: "13:00", end_time: "14:00" },
    { period: "PM", start_time: "14:00", end_time: "15:00" },
    { period: "PM", start_time: "15:00", end_time: "16:00" },
    { period: "PM", start_time: "16:00", end_time: "17:00" },
  ],
};

export function isBookingPeriod(value: unknown): value is BookingPeriod {
  return value === "AM" || value === "PM";
}

export function distributeCapacity(totalCapacity: number, slotCount: number) {
  const safeTotal = Math.max(0, Math.trunc(totalCapacity));
  const base = Math.floor(safeTotal / slotCount);
  const remainder = safeTotal % slotCount;

  return Array.from({ length: slotCount }, (_, index) => {
    return base + (index < remainder ? 1 : 0);
  });
}

export function distributePeriodSlots(period: BookingPeriod, totalCapacity: number) {
  const windows = BOOKING_SLOT_WINDOWS[period];
  const capacities = distributeCapacity(totalCapacity, windows.length);

  return windows.map((slot, index) => ({
    ...slot,
    capacity: capacities[index] ?? 0,
    is_open: true,
  }));
}

export function buildBookingSlotData(
  bookingDayId: number,
  morningCapacity: number,
  afternoonCapacity: number,
): BookingSlotData[] {
  return [
    ...distributePeriodSlots("AM", morningCapacity),
    ...distributePeriodSlots("PM", afternoonCapacity),
  ].map((slot) => ({
    ...slot,
    booking_day_id: bookingDayId,
  }));
}

export function isPastUtcDate(date: Date) {
  const compareDate = new Date(date);
  compareDate.setUTCHours(0, 0, 0, 0);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return compareDate < today;
}
