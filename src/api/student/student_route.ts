import { Router } from "express";
import * as studentController from "./student_controller";

const router = Router();

//handle registration
router.post("/submit", studentController.studentRegistration);

export default router;