import { Router } from "express";
import * as adminController from "./admin_controller";

const router = Router();

//get admin's profile
router.get("/profile", adminController.getStaffDetails);

//get all unverified students
router.get("/student", adminController.fetchUnverifiedStudents);

//get unverified student by id
router.get("/student/:id", adminController.searchUnverifiedById);

//verify student
router.patch("/student/:id", adminController.handleVerify);

//delete student record
router.delete("/student/:id", adminController.handleCancel);

//masterlist
router.get("/masterlist", adminController.fetchMasterlist);
router.post("/masterlist/reset/:id", adminController.handleStudentPasswordReset);

//final verification
router.get("/finalize", adminController.fetchAttendedStudents);
router.patch("/finalize/:studentId", adminController.handleFinalizeStudentUpdate);
router.patch("/finalize", adminController.handleFinalizeStudentStatus);

//attendance
router.post("/scan/override", adminController.handleFinalizeStudentAttended);

//queue
router.get("/queue/list", adminController.fetchAttendanceQueueList);

//booking endpoint
router.post("/book/add", adminController.addSchedule);
router.get("/book/fetch", adminController.fetchSchedule);
router.patch("/book/toggle", adminController.handleToggleScheduleState);
router.patch("/book/update", adminController.handleUpdateScheduleCapacity);

export default router;
