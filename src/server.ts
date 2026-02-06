import express, { Request, Response } from "express";
import prisma from "./config/prisma";
import studentRoutes from "./api/student/student_route"; 
import { Resend } from 'resend';
import 'dotenv/config';
import cors from "cors";
import crypto from "crypto";
import bcrypt from "bcrypt";

// const resend = new Resend(process.env.RESEND_API) needs a domain..
const app = express();
app.use(cors());
app.use(express.json());

//API ROUTES
app.use("/api/student", studentRoutes);

//get requests
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Server is running.."
  })
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

export default app;