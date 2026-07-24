import { Prisma, SolicitationType, StudentStatus } from "@prisma/client";
import prisma from "../../config/prisma";
import { generateReadUrl } from "./r2_service";
import { isPastUtcDate } from "../booking_slots";

type BookingRequest = {
  bookingSlotId: number;
};

type BookingErrorCode =
  | "INVALID_BOOKING_REQUEST"
  | "BOOKING_SLOT_NOT_FOUND"
  | "BOOKING_DAY_CLOSED"
  | "BOOKING_DAY_PAST"
  | "BOOKING_SLOT_FULL"
  | "BOOKING_ALREADY_EXISTS"
  | "BOOKING_NOT_FOUND";

export class BookingRequestError extends Error {
  code: BookingErrorCode;

  constructor(code: BookingErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function isDuplicateRegistrationError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

type SolicitationPayload = {
  type: SolicitationType;
  title: string;
  name: string;
};

async function assertStudentHasProfilePhoto(student_number: number) {
  const student = await prisma.student.findUnique({
    where: {
      student_number,
    },
    select: {
      studentDetail: {
        select: {
          photo_url: true,
        },
      },
    },
  });

  if (!student?.studentDetail?.photo_url?.trim()) {
    throw new Error("PROFILE_PHOTO_REQUIRED");
  }
}

//TODO: still unsafe, need data sanitation so we pray for now :D
export async function createStudent(body: any) {
  return await prisma.student.create({
    data: {
      student_number: parseInt(body.id),
      first_name: body.first_name,
      last_name: body.last_name,
      mid_name: body.middle_name,
      school_email: body.school_email,
      personal_email: body.personal_email,
      department: body.academics.department,
      course: body.academics.course,
      major: body.academics.major,
      nickname: body.nickname,
      suffix: body.suffix,
      thesis_title: body.academics.thesis,
      grad_term: body.grad_term,
      grad_year: body.grad_year,

      studentDetail: {
        create: {
          birth_date: new Date(body.birthdate),
          contact_num: body.contact_num,
          mothers_name: body.parent?.mothers_name,
          mothers_title: body.parent?.mothers_title,
          fathers_name: body.parent?.fathers_name,
          fathers_title: body.parent?.fathers_title,
          guardians_name: body.guardian?.guardians_name,
          guardians_title: body.guardian?.guardians_title,
          province: body.province,
          city: body.city,
          barangay: body.barangay
        },
      },

      studentAuth: {
        create: {
          is_verified: false,
          status: StudentStatus.REGISTERED
        },
      },
    },
  });
}

export async function fetchBooking() {
  const booking_days = await prisma.bookingDay.findMany({
    where: {
      is_open: true,
    },
    select: {
      id: true,
      date: true,
      is_open: true,
      max_afternoon_cap: true,
      max_morning_cap: true,
      slots: {
        orderBy: {
          start_time: "asc",
        },
        where: {
          is_open: true,
        },
        select: {
          id: true,
          booking_day_id: true,
          period: true,
          start_time: true,
          end_time: true,
          capacity: true,
          is_open: true,
          _count: {
            select: {
              bookings: true,
            },
          },
        },
      },
    }
  });

  return booking_days.map(day => {
    const slots = day.slots
      .map((slot) => {
        const booked_count = slot._count.bookings;
        return {
          id: slot.id,
          booking_day_id: slot.booking_day_id,
          period: slot.period,
          start_time: slot.start_time,
          end_time: slot.end_time,
          capacity: slot.capacity,
          is_open: slot.is_open,
          booked_count,
          available_count: Math.max(slot.capacity - booked_count, 0),
        };
      })
      .filter((slot) => slot.capacity > 0);

    const curr_morning = slots
      .filter((slot) => slot.period === "AM")
      .reduce((total, slot) => total + slot.booked_count, 0);
    const curr_afternoon = slots
      .filter((slot) => slot.period === "PM")
      .reduce((total, slot) => total + slot.booked_count, 0);

    return {
      id: day.id,
      date: day.date,
      is_open: day.is_open,
      max_morning_cap: day.max_morning_cap,
      max_afternoon_cap: day.max_afternoon_cap,
      curr_morning,
      curr_afternoon,
      slots,
    };
  });
}

function bookingWhereForSlot(slotId: number, excludeBookingId?: number) {
  const where: Prisma.BookingWhereInput = {
    booking_slot_id: slotId,
  };

  if (excludeBookingId) {
    where.NOT = {
      id: excludeBookingId,
    };
  }

  return where;
}

async function loadBookableSlot(
  client: Prisma.TransactionClient,
  bookingSlotId: number,
  excludeBookingId?: number,
) {
  await client.$queryRaw`SELECT "id" FROM "BookingSlot" WHERE "id" = ${bookingSlotId} FOR UPDATE`;

  const slot = await client.bookingSlot.findUnique({
    where: {
      id: bookingSlotId,
    },
    include: {
      booking_day: true,
    },
  });

  if (!slot) {
    throw new BookingRequestError("BOOKING_SLOT_NOT_FOUND", "The selected booking slot does not exist.");
  }

  if (!slot.is_open || !slot.booking_day.is_open) {
    throw new BookingRequestError("BOOKING_DAY_CLOSED", "The selected schedule is closed.");
  }

  if (isPastUtcDate(slot.booking_day.date)) {
    throw new BookingRequestError("BOOKING_DAY_PAST", "The selected schedule date has already passed.");
  }

  if (slot.capacity <= 0) {
    throw new BookingRequestError("BOOKING_SLOT_FULL", "The selected booking slot is not available.");
  }

  const bookedCount = await client.booking.count({
    where: bookingWhereForSlot(slot.id, excludeBookingId),
  });

  if (bookedCount >= slot.capacity) {
    throw new BookingRequestError("BOOKING_SLOT_FULL", "The selected booking slot is already full.");
  }

  return slot;
}

function readBookingSlotId(request: BookingRequest) {
  if (!Number.isInteger(request.bookingSlotId) || request.bookingSlotId <= 0) {
    throw new BookingRequestError("INVALID_BOOKING_REQUEST", "Please select a valid booking slot.");
  }

  return request.bookingSlotId;
}

export async function createBooking(student_id: number, request: BookingRequest) {
  await assertStudentHasProfilePhoto(student_id);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "student_number" FROM "Student" WHERE "student_number" = ${student_id} FOR UPDATE`;

    const existingBooking = await tx.booking.findFirst({
      where: {
        student_number: student_id,
      },
    });

    if (existingBooking) {
      throw new BookingRequestError("BOOKING_ALREADY_EXISTS", "This student already has an active booking.");
    }

    const slot = await loadBookableSlot(tx, readBookingSlotId(request));

    await tx.booking.create({
      data: {
        student_number: student_id,
        booking_day_id: slot.booking_day_id,
        booking_slot_id: slot.id,
        period: slot.period
      }
    });

    return tx.studentAuth.update({
      where: {
        student_number: student_id
      },
      data: {
        status: StudentStatus.BOOKED
      }
    });
  });
}

export async function updateBooking(booking_id: string, request: BookingRequest, student_number: string) {
  const bookingId = parseInt(booking_id);
  const studentNumber = parseInt(student_number);

  if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(studentNumber) || studentNumber <= 0) {
    throw new BookingRequestError("INVALID_BOOKING_REQUEST", "Please select a valid booking slot.");
  }

  await assertStudentHasProfilePhoto(studentNumber);

  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: {
        id: bookingId,
        student_number: studentNumber,
      },
    });

    if (!booking) {
      throw new BookingRequestError("BOOKING_NOT_FOUND", "The selected booking does not exist.");
    }

    const slot = await loadBookableSlot(tx, readBookingSlotId(request), bookingId);

    return tx.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        booking_day_id: slot.booking_day_id,
        booking_slot_id: slot.id,
        period: slot.period
      }
    });
  });
}

export async function getStudentProfile(student_number: number) {
  try {
    const student = await prisma.student.findUnique({
      where: {
        student_number: student_number
      },
      include: {
        studentDetail: true,
        studentAuth: {
          select: {
            status: true,
          },
        },
        studentSolicitations: {
          select: {
            name: true,
            title: true,
            type: true,
            slot: true,
          }
        },
        booking: {
          orderBy: {
            created_at: "desc",
          },
          include: {
            booking_day: {
              select: {
                date: true,
              },
            },
            booking_slot: true,
          },
        },
      },
    });

    if (!student) {
      return {
        success: false,
        reason: "Student doesn't exist!"
      };
    }

    if (student.studentDetail?.photo_url) {
      student.studentDetail.photo_url = await generateReadUrl(student.studentDetail.photo_url) ?? student.studentDetail.photo_url;
    }

    return {
      success: true,
      student
    };

  } catch (err) {
    console.error("Error: ", err);
    return {
      success: false,
      reason: "Server error nyae"
    };
  }
};

export async function saveSolicitations(student_number: number, sponsors: SolicitationPayload[]) {
  try {
    if (sponsors.length !== 4) {
      return {
        success: false,
        reason: "Sponsors must contain exactly 4 entries"
      };
    }

    const student = await prisma.student.findUnique({
      where: {
        student_number
      },
      select: {
        student_number: true,
      },
    });

    if (!student) {
      return {
        success: false,
        reason: "Student doesn't exist!"
      };
    }

    await prisma.$transaction(
      sponsors.map((sponsor, index) => {
        const slot = index + 1;
        const trimmedName = sponsor.name.trim();
        const trimmedTitle = sponsor.title.trim();

        if (!trimmedName) {
          return prisma.studentSolicitations.deleteMany({
            where: {
              student_number,
              slot,
            },
          });
        }

        return prisma.studentSolicitations.upsert({
          where: {
            student_number_slot: {
              student_number,
              slot,
            },
          },
          update: {
            type: sponsor.type,
            name: trimmedName,
            title: sponsor.type === "PERSON" ? trimmedTitle : null,
          },
          create: {
            student_number,
            slot,
            type: sponsor.type,
            name: trimmedName,
            title: sponsor.type === "PERSON" ? trimmedTitle : null,
          },
        });
      })
    );

    return { success: true };
  } catch (err) {
    console.error("Error: ", err);
    return {
      success: false,
      reason: "Server error"
    };
  }
}
