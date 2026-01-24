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
    const student = await prisma.student.create({
      data: {
        first_name: "Koi",
        last_name: "Arona",
        mid_name: "V.",
        personal_email: "koi@gmail.com",
        um_email: "koi@umindanao.edu.ph",
      },
    });

    console.log(student);

    return res.json({
      status: "Success",
      student,
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
