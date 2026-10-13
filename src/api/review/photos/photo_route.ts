import { Router } from "express";
import { requirePermission } from "../../auth/auth_middleware";
import { Permission } from "../../auth/permissions";
import { assertRoutesGuarded } from "../../auth/route_guard_audit";
import { requireReviewOrigin } from "../shared/review_origin";
import * as controller from "./photo_controller";

const router = Router();

router.get("/reviews", requirePermission(Permission.REVIEW_VIEW), controller.list);
router.get("/reviews/filter-options", requirePermission(Permission.REVIEW_VIEW), controller.filterOptions);
router.get("/reviews/:reviewId", requirePermission(Permission.REVIEW_VIEW), controller.detail);
router.get("/reviews/:reviewId/decision-events", requirePermission(Permission.REVIEW_VIEW), controller.decisionHistory);
router.post("/reviews/:reviewId/comments", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.comment);
router.post("/reviews/:reviewId/uploads", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.beginUpload);
router.post("/reviews/:reviewId/uploads/:assetId/finalization", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.finalizeUpload);
router.post("/reviews/:reviewId/submissions", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.submit);
router.post("/reviews/:reviewId/qc-decisions", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.qcDecision);
router.post("/reviews/:reviewId/moderator-decisions", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.moderatorDecision);

assertRoutesGuarded(router);
export default router;
