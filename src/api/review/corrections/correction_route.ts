import { Router } from "express";
import { requirePermission } from "../../auth/auth_middleware";
import { Permission } from "../../auth/permissions";
import { assertRoutesGuarded } from "../../auth/route_guard_audit";
import { requireReviewOrigin } from "../shared/review_origin";
import * as controller from "./correction_controller";

const router = Router();

router.post("/tracks/:trackId/corrections", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.create);
router.get("/corrections", requirePermission(Permission.REVIEW_VIEW), controller.list);
router.post("/corrections/:correctionId/decisions", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.decide);

assertRoutesGuarded(router);
export default router;
