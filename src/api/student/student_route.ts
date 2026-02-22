import { Router } from "express";
import * as studentController from "./student_controller";
import { verifyToken } from "../auth/auth_middleware";

const router = Router();

//handle registration
router.post("/submit", studentController.studentRegistration);

//fetch student profile respective to the id number
router.get("/profile/fetch", verifyToken, studentController.getStudentById);

//booking
router.get("/book/fetch", verifyToken, studentController.fetchBooking);
router.post("/book/create", verifyToken, studentController.createBooking);

export default router;