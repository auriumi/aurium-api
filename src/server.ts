import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Resend } from 'resend';
import 'dotenv/config';
import cors from "cors";
import crypto from "crypto";
import bcrypt from "bcrypt";

const app = express();
const connectionString = process.env.DATABASE_URL;
// const resend = new Resend(process.env.RESEND_API) needs a domain..

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

//get requests
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Server is running.."
  })
});

//fetch for unverified students
app.get("/fetch/verify", async (req: Request, res: Response) => {
  console.log("fetch got!");
  
  const unverifiedStudentsList = await fetchUnverifiedStudents();
  res.json(unverifiedStudentsList);
});

//verification
app.post("/post/verify", async (req: Request, res: Response) => {
  console.log("got verification request!");

  try {
    const body = req.body;
    if (!body.id) {
      return res.status(400).json({
        error: "Student ID is required!"
      });
    }

    const isVerified = await verifyStudent(body.id);
    
    if (!isVerified) {
      return res.status(404).json({
        message: "ID is not found or already verified!"
      });
    } else {

      //generate passwrod when verified
      await generatePass(body.id); 
      
      res.json({
        status: "Success!"
      });
    }

  } catch (err) {
    console.error("Error: ", err);

    res.status(500).json({
      status: "Invalid!",
    });
  }
});

//registration
app.post("/api/submit", async (req: Request, res: Response) => {
  console.log("post request recieved, sending response..")

  try {
    const body = req.body;
    console.log(body);

    if (!body.id) {
      throw new Error("Student ID is required!");
    }
    
    //create student
    const student = await createStudent(body);

    return res.json({
      status: "Success",
    });

  } catch (err) {
    console.error(`Error: ${err}`);

    res.status(500).json({
      status: "Error",
      message: "Server error nyae",
    });
  }
});

//function queries
async function verifyStudent(id: string) {
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

async function generatePass(id: string) {
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

async function createStudent(body: any) {
  return prisma.student.create({
    data: {
      school_email: body.school_email,
      personal_email: body.personal_email,
      last_name: body.last_name,
      first_name: body.first_name,
      mid_name: body.middle_name,
      suffix: body.suffix,
      nickname: body.nickname,
      birth_date: new Date(body.birthdate),
      course: body.academics.course,
      major: body.academics.major,
      thesis_title: body.academics.thesis,

      //student_id
      StudentAuth: {
        create: {
          student_number: parseInt(body.id),
        },
      },
      //TODO: add more required data later on..
    },
  });
}

async function fetchUnverifiedStudents() {
  return prisma.student.findMany({
    where: {
      StudentAuth: {
        is_verified: false,
      },
    },

    select: {
      first_name: true,
      last_name: true,
      course: true,
      school_email: true,
      StudentAuth: {
        select: {
          student_number: true,
        },
      },
    },
  });
}

export default app;
