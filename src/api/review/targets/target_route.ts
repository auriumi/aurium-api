import { Router } from "express";
import { requirePermission } from "../../auth/auth_middleware";
import { Permission } from "../../auth/permissions";
import { assertRoutesGuarded } from "../../auth/route_guard_audit";
import { requireReviewOrigin } from "../shared/review_origin";
import * as controller from "./target_controller";

const router = Router();
router.get("/me", requirePermission(Permission.REVIEW_VIEW), controller.getMyProgress);
router.get("/schedule", requirePermission(Permission.REVIEW_ASSIGN), controller.getSchedule);
router.get("/", requirePermission(Permission.REVIEW_ASSIGN), controller.getTargets);
router.get("/:id/history", requirePermission(Permission.REVIEW_ASSIGN), controller.getHistory);
router.put("/", requirePermission(Permission.REVIEW_ASSIGN), requireReviewOrigin, controller.setTargets);

assertRoutesGuarded(router);
export default router;
