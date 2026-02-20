import { Router } from "express";
import * as adminController from "./admin_controller";
import { verifyToken } from "../auth/auth_middleware";

const router = Router();

//student verifier endpoint
router.post("/student/verify", verifyToken, adminController.handleVerify);
router.get("/student/fetch", verifyToken, adminController.fetchUnverifiedStudents);

//booking endpoint
router.post("/book/add", verifyToken, adminController.addSchedule);
router.get("/book/fetch", verifyToken, adminController.fetchSchedule);

export default router;