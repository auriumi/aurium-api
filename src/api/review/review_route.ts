import { Router } from "express";
import { requirePermission } from "../auth/auth_middleware";
import { Permission } from "../auth/permissions";
import { assertRoutesGuarded } from "../auth/route_guard_audit";
import * as controller from "./review_controller";
import { requireReviewOrigin } from "./review_origin";

const router = Router();

router.get("/review-capabilities", requirePermission(Permission.REVIEW_VIEW), controller.getCapabilities);
router.post("/review-assignments", requirePermission(Permission.REVIEW_ASSIGN), requireReviewOrigin, controller.createAssignment);
router.patch("/review-assignments/:id", requirePermission(Permission.REVIEW_ASSIGN), requireReviewOrigin, controller.deactivateAssignment);

assertRoutesGuarded(router);

export default router;
