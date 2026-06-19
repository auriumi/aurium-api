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

const ADMIN_RATE_LIMIT_WINDOW_MS = 3 * 60 * 1000;

export const ADMIN_RATE_LIMITS = {
  windowMs: ADMIN_RATE_LIMIT_WINDOW_MS,
  queuePolls: 90,
  reads: 120,
  mutations: 50,
} as const;

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

const queue_poll_limiter = rateLimit({
  windowMs: ADMIN_RATE_LIMITS.windowMs,
  limit: ADMIN_RATE_LIMITS.queuePolls,
  message: "Too many queue refresh requests, please try again later",
  legacyHeaders: false,
});

const admin_read_limiter = rateLimit({
  windowMs: ADMIN_RATE_LIMITS.windowMs,
  limit: ADMIN_RATE_LIMITS.reads,
  message: "Too many admin read requests, please try again later",
  legacyHeaders: false,
  skip: (req) => (
    (req.method !== "GET" && req.method !== "HEAD")
    || req.path === "/queue/list"
  ),
});

const admin_mutation_limiter = rateLimit({
  windowMs: ADMIN_RATE_LIMITS.windowMs,
  limit: ADMIN_RATE_LIMITS.mutations,
  message: "Too many admin changes, please try again later",
  legacyHeaders: false,
  skip: (req) => req.method === "GET" || req.method === "HEAD",
});

const gen_limiter = rateLimit({
  windowMs: 3 * 60 * 1000, //3 mins
  limit: 10,
  message: "Too many request, please try again later :P",
  legacyHeaders: false
});

//API ROUTES
app.use("/api/admin/queue/list", queue_poll_limiter);
app.use(
  "/api/admin",
  admin_read_limiter,
  admin_mutation_limiter,
  verifyToken,
  isAdmin,
  adminRoutes,
);
app.use("/api/student", gen_limiter, verifyToken, studentRoutes);
app.use("/api/auth", login_limiter, authRoutes);

export default app;
