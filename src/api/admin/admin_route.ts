import { Router } from "express";
import * as adminController from "./admin_controller";
import { isAdmin, verifyToken } from "../auth/auth_middleware";

const router = Router();

//student verifier endpoint
router.post("/student/verify", verifyToken, isAdmin, adminController.handleVerify);

//get all unverified students
router.get("/student/fetch", verifyToken, isAdmin, adminController.fetchUnverifiedStudents);

//get student by id
router.get("/student/search", verifyToken, isAdmin, adminController.searchUnverifiedById);

//booking endpoint
router.post("/book/add", verifyToken, isAdmin, adminController.addSchedule);
router.get("/book/fetch", verifyToken, isAdmin, adminController.fetchSchedule);

export default router;