import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import 'dotenv/config';
import cors from "cors";

const app = express();
const connectionString = process.env.DATABASE_URL;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

//get requests
app.get("/", (req: Request, res: Response) => {
  res.send("Server is running..");
});

app.get("/test", (req: Request, res: Response) => {
  console.log("get request recieved, sending response..")

  res.json({
    message: "Request works.."
  });
});

//post requests
app.post("/api/submit", async (req: Request, res: Response) => {
  console.log("post request recieved, sending response..")

  
  try {
    const body = req.body;

    if (!body.id) {
      throw new Error("Student ID is required!");
    }

    const student = await prisma.student.create({
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
        studentNumber: {
          create: {
            student_number: parseInt(body.id),
            is_verified: false,
          },
        },

        //TODO: add more required data later on..
      },
    });

    console.log("student added: ", student);

    return res.json({
      status: "Success",
    });

  } catch (err) {
    console.error(`err: ${err}`);

    res.status(500).json({
      status: "Error",
      message: "Server error nyae",
    });
  }
});

export default app;
