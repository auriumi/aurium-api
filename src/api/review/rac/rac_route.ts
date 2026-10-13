import { Router } from "express";
import { requirePermission } from "../../auth/auth_middleware";
import { Permission } from "../../auth/permissions";
import { assertRoutesGuarded } from "../../auth/route_guard_audit";
import { requireReviewOrigin } from "../shared/review_origin";
import * as controller from "./rac_controller";

const router = Router();

router.get("/graduates", requirePermission(Permission.REVIEW_VIEW), controller.listGraduates);
router.get("/graduates/filter-options", requirePermission(Permission.REVIEW_VIEW), controller.getFilterOptions);
router.get("/graduates/:studentNumber/verification-events", requirePermission(Permission.REVIEW_VIEW), controller.getHistory);
router.post("/verification-batches", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.createVerificationBatch);

assertRoutesGuarded(router);
export default router;
