import { Router } from "express";
import * as adminController from "./admin_controller";
import { verifyToken } from "../auth/auth_middleware";

const router = Router();

router.post("/student/verify", verifyToken, adminController.handleVerify);
router.get("/student/fetch", verifyToken, adminController.fetchUnverifiedStudents);

export default router;