import express, { Request, Response } from "express";
import prisma from "./config/prisma";
import studentRoutes from "./api/student/student_route"; 
import cors from "cors";

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

export default app;