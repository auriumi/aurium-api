import { SolicitationType, StudentStatus } from "@prisma/client";
import prisma from "../../config/prisma";

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
        select: {
          period: true,
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

export async function createBooking(student_id: number, booking_id: number, period: string) {
  try {
    return await prisma.booking.create({
      data: {
        student_number: student_id,
        booking_day_id: booking_id,
        period: period
      }
    }),
    prisma.studentAuth.update({
      where: {
        student_number: student_id
      },
      data: {
        status: StudentStatus.BOOKED
      }
    });
  } catch(err) {
    console.error("Error: ", err);
  }
}

export async function updateBooking(booking_id: string, booking_day_id: number, period: string) {
  try {
    return await prisma.booking.update({
      where: {
        id: parseInt(booking_id) 
      },
      data: {
        booking_day_id: booking_day_id,
        period: period
      }
    });
  } catch(err) {
    console.error("Error: ", err);
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