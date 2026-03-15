import prisma from "../../config/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from 'resend';
import { AdminActions, StudentStatus } from "@prisma/client";

const resend = new Resend(process.env.RESEND_API);
const DOMAIN = "auriumi.cloud";

//pagination query
const STUDENTS_PER_PAGE = 8;
const M_STUDENTS_PER_PAGE = 9;

const STATUS_MAP: Record<number, StudentStatus> = {
  1: StudentStatus.REGISTERED,
  2: StudentStatus.APPROVED,
  3: StudentStatus.BOOKED,
  4: StudentStatus.ATTENDED,
  5: StudentStatus.FULLY_VERIFIED
}

export async function verifyStudent(id: string, admin_id: string) {
  try {
    //student lookup
    const student = await prisma.student.update({
      where: {
        student_number: parseInt(id),
      },
      data: {
        studentAuth: {
          update: {
            is_verified: true,
          },
        },
      },
      include: {
        studentAuth: true,
      }
    });
    if (!student) return { success: false, reason: "Student ID doesn't exist or already verified!" };

    //generate temp pass and hash
    const temp_pass = await generatePass();

    //upload hashed pass
    await prisma.student.update({
      where : {
        student_number: parseInt(id)
      },
      data: {
        studentAuth: {
          update: {
            hashed_password: temp_pass.hash_pass,
            status: StudentStatus.APPROVED,
          },
        },
      },
    });

    //get the email
    const get_email = await prisma.student.findUnique({
      where: {
        student_number: parseInt(id),
      },
      select: {
        school_email: true,
        personal_email: true,
      }
    }); 

    if (!get_email) {
      return { 
        success: false,
        reason: 'Student has no school email provided!'
      };
    }

    //check if school email is null then fallback to their personal email instead
    const email = get_email.school_email ? get_email.school_email : get_email.personal_email; 

    //send credentials to the respective student email
    const send_pass = await sendCreds(temp_pass.actual_pass, email);
    if (!send_pass) return { success: false, reason: "Email API Error" };

    //generate log if everything succeeds
    await generateLog(parseInt(admin_id), student.student_number, AdminActions.APPROVED); 

    return { success: true };
  } catch (err: any) {
    return { 
      success: false, 
      reason: "Something went wrong!"
    };
  }
}

export async function generateLog(admin_id: number, target_id: number, action: AdminActions) {
  return await prisma.logs.create({
    data: {
      admin_id: admin_id,
      action: action,
      target_id: target_id
    }
  });
}

export async function generatePass() {
  const chars: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  const charsLength: number = chars.length;
  const passLength = 10;
  let tempPass: string = "";
  
  for (let i = 0; i < passLength; i++) {
    const randIndex = crypto.randomInt(0, charsLength);
    tempPass += chars.charAt(randIndex);
  }
  
  //hashing password with bcrypt
  const hashedPass = await bcrypt.hash(tempPass, 10);

  return {
    actual_pass: tempPass,
    hash_pass: hashedPass
  };
}

//send temporary password to their email
export async function sendCreds(pass: string, recipent: string) {
  const { error } = await resend.emails.send({
    from: `Aurium <noreply@${DOMAIN}>`,
    to: recipent,
    template: {
      id: "password-verification",
      variables: {
        TEMP_PASSWORD: pass
      },
    },
  });
  return !error;
}

//get total count of unverified students
export async function getUnverifiedStudentCount() {
  return prisma.studentAuth.count({
    where: {
      is_verified: false
    },
  });
}

//on fetch for unverified students (offset-based pagination)
export async function gethUnverifiedStudents(page: number) {
  const skip = (page - 1) * STUDENTS_PER_PAGE;
  return prisma.student.findMany({
    skip: skip,
    take: STUDENTS_PER_PAGE,
    orderBy: {
      id: 'asc'
    },
    where: {
      studentAuth: {
        is_verified: false,
      },
    },
    include: {
      studentDetail: true,
    }
  });
}

//get student by id (search query)
export async function getUnverifiedStudentById(student_id: number) {
  const student = await prisma.student.findUnique({
    where: {
      student_number: student_id,
    },
    include: {
      studentDetail: true,
    }
  });

  if (!student) {
    return {
      success: false,
      reason: "Student ID not found"
    };
  }

  return { 
    success: true,
    student
   };
} 

//add schedule per day
export async function addSchedule(date: string, am_cap: number, pm_cap: number) {
  return prisma.bookingDay.create({
    data: {
      date: new Date(`${date}T00:00:00.000Z`),
      max_morning_cap: am_cap,
      max_afternoon_cap: pm_cap
    }
  });
}

//fetch schedule per day
//TODO: paginate query
export async function fetchSchedule() {
  return prisma.bookingDay.findMany({
    include: {
      bookings: {
        include: {
          student: {
            select: {
              first_name: true,
              last_name: true,
              student_number: true,
              studentAuth: {
                select: {
                  status: true
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function m_queryByFilter(page: number, dept: string, course: string, status: string) {
  const safe_page = page > 0 ? page : 1;
  const skip = (safe_page - 1) * M_STUDENTS_PER_PAGE;

  const where: any = {};
  if (dept !== "ALL") where.department = dept;
  if (course !== "ALL") where.course = course;

  if (status !== "ALL") {
    const status_map = STATUS_MAP[Number(status)];
    if (status_map) {
      where.studentAuth = { status: status_map };
    }
  }
  
  const total_students = await prisma.student.count();
  const total_result = await prisma.student.count({where});

  const students = await prisma.student.findMany({
    skip,
    take: M_STUDENTS_PER_PAGE,
    orderBy: { id: "asc" as const },
    where,
    include: {
      studentDetail: true,
      studentAuth: {
        select: { status: true },
      },
    },
  });

  return { students, total_students, total_result };
}

export async function m_queryById(student_id: number) {
  const student = await prisma.student.findUnique({
    where: {
      student_number: student_id,
    },
    include: {
      studentDetail: true,
      studentAuth: {
        select: {
          status: true,
        }
      }
    }
  });

  if (!student) return { success: false, reason: "Student doesn't exist!" };
  return { success: true, student };
}