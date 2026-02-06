import { Router } from "express";
import * as studentController from "./student_controller";

const router = Router();

//this is admin request, add to auth module later..
router.get("/fetch", studentController.fetchUnverifiedStudents);

//handle registration
router.post("/submit", studentController.studentRegistration);

export default router;