import prisma from "../../config/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from 'resend';

// const resend = new Resend(process.env.RESEND_API) needs a domain..

export async function verifyStudent(id: string) {
  try {
    const res = await prisma.studentAuth.update({
      where: {
        student_number: parseInt(id),
        is_verified: false,
      },
      data: {
        is_verified: true,
      }
    });

    return res;
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
    const res = await prisma.studentAuth.update({
      where : {
        student_number: parseInt(id)
      },
      data: {
        hashed_password: hashedPass 
      }
    });

    return res;
  } catch (err: any) {
    console.error("err at password generation: ", err);
  }
}