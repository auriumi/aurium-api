import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { rateLimit } from "express-rate-limit";
import { isAdmin, verifyToken } from "./api/auth/auth_middleware";

import studentRoutes from "./api/student/student_route"; 
import adminRoutes from "./api/admin/admin_route";
import authRoutes from "./api/auth/auth_route";

const app = express();

const corsConfig = {
  origin: process.env.NODE_ENV == "production"
    ? "https://aurium-yearbook.site" //production
    : "http://localhost:3000", //local dev
  credentials: true,
}

app.use(helmet());
app.use(cors(corsConfig));
app.use(express.json());
app.use(cookieParser());

const login_limiter = rateLimit({
  windowMs: 5 * 60 * 1000, //5 mins
  limit: 5,
  message: "Too many login attempts, please try again later",
  legacyHeaders: false
});

const admin_limiter = rateLimit({
  windowMs: 3 * 60 * 1000, //3 mins
  limit: 50,
  message: "Too many request, please try again later :P",
  legacyHeaders: false
});

const gen_limiter = rateLimit({
  windowMs: 3 * 60 * 1000, //3 mins
  limit: 10,
  message: "Too many request, please try again later :P",
  legacyHeaders: false
});

//API ROUTES
app.use("/api/admin", admin_limiter, verifyToken, isAdmin, adminRoutes);
app.use("/api/student", gen_limiter, verifyToken, studentRoutes);
app.use("/api/auth", login_limiter, authRoutes);

export default app;