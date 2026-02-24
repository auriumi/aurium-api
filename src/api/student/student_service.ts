import { StudentStatus } from "@prisma/client";
import prisma from "../../config/prisma";

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
          fathers_name: body.parent?.father_name,
          guardians_name: body.guardian?.guardians_name,
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
  return await prisma.bookingDay.findMany();
}

export async function createBooking(student_id: number, booking_id: number, period: string) {
  try {
    const session_count = period === 'AM' ? 'curr_morning' : 'curr_afternoon';

    return await prisma.booking.create({
      data: {
        student_number: student_id,
        booking_day_id: booking_id,
        period: period
      }
    }),
    prisma.bookingDay.update({
      where: {
        id: booking_id
      },
      data: {
        [session_count]: {
          increment: 1
        },
      },
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