import { Router } from "express";
import * as adminController from "./admin_controller";
import { requirePermission, requireImageApprover } from "../auth/auth_middleware";
import { Permission } from "../auth/permissions";
import { assertRoutesGuarded } from "../auth/route_guard_audit";

const router = Router();

//get admin's profile (self-scoped)
router.get("/profile", adminController.getStaffDetails);

//verify admin password (used before sensitive actions, self-scoped)
router.post("/verify-password", adminController.verifyPassword);

//change own password (self-scoped)
router.patch("/change-password", adminController.handleChangePassword);

//get all unverified students
router.get("/student", requirePermission(Permission.VERIFICATION_VIEW), adminController.fetchUnverifiedStudents);

//get unverified student by id
router.get("/student/:id", requirePermission(Permission.VERIFICATION_VIEW), adminController.searchUnverifiedById);

//delete student record
router.delete("/student/:id", requirePermission(Permission.STUDENT_DISCARD), adminController.handleCancel);

//masterlist
router.get("/masterlist/export", requirePermission(Permission.MASTERLIST_EXPORT), adminController.exportMasterlist);
router.get("/masterlist", requirePermission(Permission.MASTERLIST_VIEW), adminController.fetchMasterlist);
router.post("/masterlist/reset/:id", requirePermission(Permission.STUDENT_PASSWORD_RESET), adminController.handleStudentPasswordReset);

//final verification
router.get("/finalize", requirePermission(Permission.FINALIZE_VIEW), adminController.fetchApprovedStudents);
router.get("/finalize/:student_id", requirePermission(Permission.FINALIZE_VIEW), adminController.fetchApprovedStudentsById);
router.patch("/finalize/:studentId", requirePermission(Permission.FINALIZE_UPDATE), adminController.handleFinalizeStudentUpdate);
router.patch("/finalize", requirePermission(Permission.FINALIZE_STATUS), adminController.handleFinalizeStudentStatus);

//attendance
router.post("/scan/override", requirePermission(Permission.ATTENDANCE_OVERRIDE), adminController.handleFinalizeStudentAttended);

//queue
router.get("/queue/list", requirePermission(Permission.ATTENDANCE_VIEW), adminController.fetchAttendanceQueueList);

//booking endpoint
router.post("/book/add", requirePermission(Permission.BOOKING_CREATE), adminController.addSchedule);
router.get("/book/fetch", requirePermission(Permission.BOOKING_VIEW), adminController.fetchSchedule);
router.patch("/book/toggle", requirePermission(Permission.BOOKING_TOGGLE), adminController.handleToggleScheduleState);
router.patch("/book/update", requirePermission(Permission.BOOKING_UPDATE), adminController.handleUpdateScheduleCapacity);

// staff role management (Administrator only)
router.get("/staff/list", requirePermission(Permission.STAFF_VIEW), adminController.fetchStaffList);
router.patch("/staff/:id/role", requirePermission(Permission.STAFF_MANAGE_ROLE), adminController.handleUpdateAdminRole);
router.patch("/staff/:id/image-approver", requirePermission(Permission.STAFF_MANAGE_ROLE), adminController.handleUpdateImageApprover);

// image management (graduation / theme pictures)
router.get("/images/students", requirePermission(Permission.IMAGE_VIEW), adminController.fetchImageStudents);
router.get("/images/get-upload", requirePermission(Permission.IMAGE_UPLOAD), adminController.getImageUploadUrl);
router.post("/images/save", requirePermission(Permission.IMAGE_UPLOAD), adminController.saveImageUrl);

// image approval forum
router.get("/images/approvals", requirePermission(Permission.IMAGE_APPROVE), adminController.fetchImageApprovals);
router.patch("/images/:id/status", requirePermission(Permission.IMAGE_APPROVE), requireImageApprover, adminController.handleImageDecision);
router.get("/images/:id/comments", requirePermission(Permission.IMAGE_VIEW), adminController.fetchImageThread);
router.post("/images/:id/comments", requirePermission(Permission.IMAGE_VIEW), adminController.handleAddImageComment);

// notifications (self-scoped)
router.get("/notifications", adminController.fetchNotifications);
router.get("/notifications/unread-count", adminController.fetchNotificationCount);
router.patch("/notifications/read-all", adminController.handleMarkAllNotificationsRead);
router.patch("/notifications/:id/read", adminController.handleMarkNotificationRead);

//route guard exemptions
assertRoutesGuarded(router, [
    "GET /profile",
    "POST /verify-password",
    "PATCH /change-password",
    "GET /notifications",
    "GET /notifications/unread-count",
    "PATCH /notifications/read-all",
    "PATCH /notifications/:id/read",
]);

export default router;