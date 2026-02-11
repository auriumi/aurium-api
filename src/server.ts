import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import studentRoutes from "./api/student/student_route"; 
import adminRoutes from "./api/admin/admin_route";
import authRoutes from "./api/auth/auth_route";

const app = express();

const corsConfig = {
  origin: 'http://localhost:3000',
  credentials: true,
}
app.use(cors(corsConfig));
app.use(express.json());
app.use(cookieParser());

//API ROUTES
app.use("/api/student", studentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Invalid Request!"
  })
});

export default app;