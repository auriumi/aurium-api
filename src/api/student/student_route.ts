import { Router } from "express";
import * as studentController from "./student_controller";
import { verifyToken } from "../auth/auth_middleware";

const router = Router();

//handle registration
router.post("/submit", studentController.studentRegistration);

//fetch student profile respective to the id number
router.get("/profile/fetch", studentController.getStudentById);

//uplaod url endpoint
router.get("/profile/get-upload", studentController.getPhotoUploadUrl);
router.post("/profile/upload", studentController.savePhotoUrl);

//booking
router.get("/book/fetch", studentController.fetchBooking);
router.post("/book/create", studentController.createBooking);
router.patch("/book/update/:id", studentController.updateBooking);

//solicitation
router.post("/solicitation", studentController.saveSolicitations);

export default router;