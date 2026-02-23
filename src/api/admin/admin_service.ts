import prisma from "../../config/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from 'resend';
import { StudentStatus } from "@prisma/client";

// const resend = new Resend(process.env.RESEND_API) needs a domain..

export async function verifyStudent(id: string) {
  try {
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

    return student.studentAuth;
  } catch (err: any) {
    return false;
  }
}

export async function generatePass(id: string) {
  const chars: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  const charsLength: number = chars.length;
  const passLength = 10;
  let tempPass: string = "";
  
  for (let i = 0; i < passLength; i++) {
    const randIndex = crypto.randomInt(0, charsLength);
    tempPass += chars.charAt(randIndex);
  }
  
  //hashing password with bcrypt
  console.log("generated pass: ", tempPass);
  const hashedPass = await bcrypt.hash(tempPass, 10);
  
  try {
    const student = await prisma.student.update({
      where : {
        student_number: parseInt(id)
      },
      data: {
        studentAuth: {
          update: {
            hashed_password: hashedPass,
            status: StudentStatus.APPROVED,
          },
        },
      },
      include: {
        studentAuth: true
      }
    });

    return student.studentAuth;
  } catch (err: any) {
    console.error("err at password generation: ", err);
  }
}

const STUDENTS_PER_PAGE = 8;

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