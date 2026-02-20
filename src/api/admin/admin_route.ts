import { Router } from "express";
import * as adminController from "./admin_controller";
import { isAdmin, verifyToken } from "../auth/auth_middleware";

const router = Router();

//student verifier endpoint
router.post("/student/verify", verifyToken, isAdmin, adminController.handleVerify);
router.get("/student/fetch", verifyToken, isAdmin, adminController.fetchUnverifiedStudents);

//booking endpoint
router.post("/book/add", verifyToken, isAdmin, adminController.addSchedule);
router.get("/book/fetch", verifyToken, isAdmin, adminController.fetchSchedule);

export default router;