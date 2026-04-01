import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { isAdmin, verifyToken } from "./api/auth/auth_middleware";

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

const login_limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  message: "Too many login attempts, please try again later",
  legacyHeaders: false
});

const gen_limiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  limit: 10,
  message: "Too many request, please try again later :P",
  legacyHeaders: false
});

//API ROUTES
app.use("/api/admin", gen_limiter, verifyToken, isAdmin, adminRoutes);
app.use("/api/student", gen_limiter, verifyToken, studentRoutes);
app.use("/api/auth", login_limiter, authRoutes);

app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Invalid Request!"
  })
});

export default app;