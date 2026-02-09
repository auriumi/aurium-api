import express, { Request, Response } from "express";
import cors from "cors";
import studentRoutes from "./api/student/student_route"; 
import adminRoutes from "./api/admin/admin_route";
import authRoutes from "./api/auth/auth_route";

const app = express();
app.use(cors());
app.use(express.json());

//API ROUTES
app.use("/api/student", studentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);

//get requests
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Server is running.."
  })
});

export default app;