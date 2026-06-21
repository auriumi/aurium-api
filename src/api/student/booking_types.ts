export const BOOKING_PERIODS = ["AM", "PM"] as const;

export type BookingPeriod = (typeof BOOKING_PERIODS)[number];

export type BookingDayRecord = {
  id: number;
  date: Date;
  is_open: boolean;
  max_morning_cap: number;
  max_afternoon_cap: number;
};

export type BookingRecord = {
  id: number;
  student_number: number;
  booking_day_id: number;
  period: string;
  created_at: Date;
};
