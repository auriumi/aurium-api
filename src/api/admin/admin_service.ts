import prisma from "../../config/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from 'resend';

// const resend = new Resend(process.env.RESEND_API) needs a domain..

export async function verifyStudent(id: string) {
  try {
    const student = await prisma.student.update({
      where: {
        student_number: parseInt(id),
      },
      data: {
        StudentAuth: {
          update: {
            is_verified: true,
          },
        },
      },
      include: {
        StudentAuth: true,
      }
    });

    return student.StudentAuth;
  } catch (err: any) {
    return false;
    throw err;
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
        StudentAuth: {
          update: {
            hashed_password: hashedPass,
            status: 2,
          },
        },
      },
      include: {
        StudentAuth: true
      }
    });

    return student.StudentAuth;
  } catch (err: any) {
    console.error("err at password generation: ", err);
  }
}

//on fetch for unverified students
export async function fetchUnverifiedStudents() {
  return prisma.student.findMany({
    where: {
      StudentAuth: {
        is_verified: false,
      },
    },
    include: {
      studentDetail: true,
    }
  });
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