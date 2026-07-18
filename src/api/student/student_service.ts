import { SolicitationType, StudentStatus } from "@prisma/client";
import prisma from "../../config/prisma";
import { generateReadUrl } from "./r2_service";

type SolicitationPayload = {
  type: SolicitationType;
  title: string;
  name: string;
};

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
      max_afternoon_cap: true,
      max_morning_cap: true,
      bookings: {
        orderBy: {
          created_at: "asc",
        },
        select: {
          id: true,
          period: true,
          created_at: true,
        }
      },
    }
  });

  return booking_days.map(day => {
    const curr_morning = day.bookings.filter(p => p.period === 'AM').length;
    const curr_afternoon = day.bookings.filter(p => p.period === 'PM').length;

    return {
      id: day.id,
      date: day.date,
      max_morning_cap: day.max_morning_cap,
      max_afternoon_cap: day.max_afternoon_cap,
      curr_morning,
      curr_afternoon
    };
  });
}

function isPastUtcDate(date: Date) {
  const compareDate = new Date(date);
  compareDate.setUTCHours(0, 0, 0, 0);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return compareDate < today;
}

async function validateBookingSlot(booking_day_id: number, period: string, excludeBookingId?: number) {
  const bookingDay = await prisma.bookingDay.findUnique({
    where: { id: booking_day_id },
    select: {
      id: true,
      date: true,
      is_open: true,
      max_morning_cap: true,
      max_afternoon_cap: true,
    },
  });

  if (!bookingDay) return { success: false, reason: "Schedule date is not available." };
  if (!bookingDay.is_open) return { success: false, reason: "This schedule date is already closed." };
  if (isPastUtcDate(bookingDay.date)) return { success: false, reason: "This schedule date has already passed." };

  const capacity = period === "AM" ? bookingDay.max_morning_cap : bookingDay.max_afternoon_cap;
  if (capacity <= 0) return { success: false, reason: "This session is not open for booking." };

  const booked = await prisma.booking.count({
    where: {
      booking_day_id,
      period,
      ...(excludeBookingId ? { NOT: { id: excludeBookingId } } : {}),
    },
  });

  if (booked >= capacity) return { success: false, reason: "This session is already full." };

  return { success: true };
}

export async function createBooking(student_id: number, booking_id: number, period: string) {
  try {
    const existingBooking = await prisma.booking.findFirst({
      where: { student_number: student_id },
      select: { id: true },
    });

    if (existingBooking) {
      return { success: false, reason: "You already have a booking." };
    }

    const slot = await validateBookingSlot(booking_id, period);
    if (!slot.success) return slot;

    await prisma.$transaction([
      prisma.booking.create({
        data: {
          student_number: student_id,
          booking_day_id: booking_id,
          period,
        },
      }),
      prisma.studentAuth.update({
        where: {
          student_number: student_id
        },
        data: {
          status: StudentStatus.BOOKED
        }
      }),
    ]);

    return { success: true };
  } catch(err) {
    console.error("Error: ", err);
    return { success: false, reason: "Something went wrong while booking your schedule." };
  }
}

export async function updateBooking(booking_id: string, booking_day_id: number, period: string, student_number: string) {
  try {
    const bookingId = parseInt(booking_id);
    const studentNumber = parseInt(student_number);

    const existingBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, student_number: true },
    });

    if (!existingBooking || existingBooking.student_number !== studentNumber) {
      return { success: false, reason: "Booking not found." };
    }

    const slot = await validateBookingSlot(booking_day_id, period, bookingId);
    if (!slot.success) return slot;

    await prisma.booking.update({
      where: {
        id: bookingId,
      },
      data: {
        booking_day_id,
        period,
      }
    });

    return { success: true };
  } catch(err) {
    console.error("Error: ", err);
    return { success: false, reason: "Something went wrong while updating your schedule." };
  }
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
          include: {
            booking_day: {
              select: {
                date: true,
                max_morning_cap: true,
                max_afternoon_cap: true,
                bookings: {
                  orderBy: {
                    created_at: "asc",
                  },
                  select: {
                    id: true,
                    period: true,
                    created_at: true,
                  },
                },
              },
            },
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
