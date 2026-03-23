import { Router } from "express";
import * as adminController from "./admin_controller";
import { isAdmin, verifyToken } from "../auth/auth_middleware";

const router = Router();

//get admin's profile
router.get("/profile", verifyToken, isAdmin, adminController.getStaffDetails);

//student verifier endpoint
router.post("/student/verify", verifyToken, isAdmin, adminController.handleVerify);
router.delete("/student/:id", verifyToken, isAdmin, adminController.handleCancel);

//get all unverified students
router.get("/student/fetch", verifyToken, isAdmin, adminController.fetchUnverifiedStudents);

//get student by id
router.get("/student/search", verifyToken, isAdmin, adminController.searchUnverifiedById);

//masterlist
router.get("/masterlist", verifyToken, isAdmin, adminController.fetchMasterlist);
router.post("/masterlist/reset/:id", verifyToken, isAdmin, adminController.handleStudentPasswordReset);

//final verification
router.get("/finalize/fetch", verifyToken, isAdmin, adminController.fetchAttendedStudents);
router.patch("/finalize/update/:studentId", verifyToken, isAdmin, adminController.handleFinalizeStudentUpdate);
router.patch("/finalize/verify", verifyToken, isAdmin, adminController.handleFinalizeStudentStatus);

//attendance
router.post("/scan/override", verifyToken, isAdmin, adminController.handleFinalizeStudentAttended);

//queue
router.get("/queue/list", verifyToken, isAdmin, adminController.fetchAttendanceQueueList);

//booking endpoint
router.post("/book/add", verifyToken, isAdmin, adminController.addSchedule);
router.get("/book/fetch", verifyToken, isAdmin, adminController.fetchSchedule);
router.patch("/book/toggle", verifyToken, isAdmin, adminController.handleToggleScheduleState);
router.patch("/book/update", verifyToken, isAdmin, adminController.handleUpdateScheduleCapacity);

export default router;