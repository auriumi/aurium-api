import { Router } from "express";
import * as adminController from "./admin_controller";

const router = Router();

router.post("student/verify", adminController.handleVerify);
router.get("student/fetch", adminController.fetchUnverifiedStudents);