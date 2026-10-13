import { Router } from "express";
import { requirePermission } from "../../auth/auth_middleware";
import { Permission } from "../../auth/permissions";
import { assertRoutesGuarded } from "../../auth/route_guard_audit";
import { requireReviewOrigin } from "../shared/review_origin";
import * as controller from "./assignment_controller";

const router = Router();

router.get("/capabilities", requirePermission(Permission.REVIEW_VIEW), controller.getCapabilities);
router.get("/staff", requirePermission(Permission.REVIEW_ASSIGN), controller.getReviewStaff);
router.post("/assignments", requirePermission(Permission.REVIEW_ASSIGN), requireReviewOrigin, controller.createAssignment);
router.patch("/assignments/:id", requirePermission(Permission.REVIEW_ASSIGN), requireReviewOrigin, controller.deactivateAssignment);

assertRoutesGuarded(router);
export default router;
