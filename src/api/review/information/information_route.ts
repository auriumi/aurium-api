import { Router } from "express";
import { requirePermission } from "../../auth/auth_middleware";
import { Permission } from "../../auth/permissions";
import { assertRoutesGuarded } from "../../auth/route_guard_audit";
import { requireReviewOrigin } from "../shared/review_origin";
import * as controller from "./information_controller";

const router = Router();

router.get("/reviews", requirePermission(Permission.REVIEW_VIEW), controller.listReviews);
router.get("/reviews/filter-options", requirePermission(Permission.REVIEW_VIEW), controller.getFilterOptions);
router.get("/reviews/:reviewId/revisions", requirePermission(Permission.REVIEW_VIEW), controller.getDraftHistory);
router.get("/reviews/:reviewId/decision-events", requirePermission(Permission.REVIEW_VIEW), controller.getDecisionHistory);
router.post("/reviews/:reviewId/comments", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.addComment);
router.patch("/reviews/:reviewId/draft", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.saveDraft);
router.post("/reviews/:reviewId/submissions", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.submitReview);
router.post("/reviews/:reviewId/qc-decisions", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.decideQc);
router.post("/reviews/:reviewId/moderator-decisions", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, controller.decideModerator);
router.get("/reviews/:reviewId", requirePermission(Permission.REVIEW_VIEW), controller.getReview);

assertRoutesGuarded(router);
export default router;
