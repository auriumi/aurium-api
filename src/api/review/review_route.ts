import { Router } from "express";
import { requirePermission } from "../auth/auth_middleware";
import { Permission } from "../auth/permissions";
import { assertRoutesGuarded } from "../auth/route_guard_audit";
import * as controller from "./review_controller";
import * as racController from "./rac_controller";
import * as informationController from "./information_controller";
import * as photoController from "./photo_controller";
import { requireReviewOrigin } from "./review_origin";

const router = Router();

router.get("/review-capabilities", requirePermission(Permission.REVIEW_VIEW), controller.getCapabilities);
router.post("/review-assignments", requirePermission(Permission.REVIEW_ASSIGN), requireReviewOrigin, controller.createAssignment);
router.patch("/review-assignments/:id", requirePermission(Permission.REVIEW_ASSIGN), requireReviewOrigin, controller.deactivateAssignment);
router.get("/review-graduates", requirePermission(Permission.REVIEW_VIEW), racController.listGraduates);
router.get("/review-graduate-filter-options", requirePermission(Permission.REVIEW_VIEW), racController.getFilterOptions);
router.get("/review-graduates/:studentNumber/verification-events", requirePermission(Permission.REVIEW_VIEW), racController.getHistory);
router.post("/verification-batches", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, racController.createVerificationBatch);
router.get("/information-reviews", requirePermission(Permission.REVIEW_VIEW), informationController.listReviews);
router.get("/information-reviews/filter-options", requirePermission(Permission.REVIEW_VIEW), informationController.getFilterOptions);
router.get("/information-reviews/:reviewId/revisions", requirePermission(Permission.REVIEW_VIEW), informationController.getDraftHistory);
router.get("/information-reviews/:reviewId/decision-events", requirePermission(Permission.REVIEW_VIEW), informationController.getDecisionHistory);
router.post("/information-reviews/:reviewId/comments", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, informationController.addComment);
router.patch("/information-reviews/:reviewId/draft", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, informationController.saveDraft);
router.post("/information-reviews/:reviewId/submission", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, informationController.submitReview);
router.post("/information-reviews/:reviewId/qc-decision", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, informationController.decideQc);
router.post("/information-reviews/:reviewId/moderator-decision", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, informationController.decideModerator);
router.get("/information-reviews/:reviewId", requirePermission(Permission.REVIEW_VIEW), informationController.getReview);
router.get("/photo-reviews", requirePermission(Permission.REVIEW_VIEW), photoController.list);
router.get("/photo-reviews/filter-options", requirePermission(Permission.REVIEW_VIEW), photoController.filterOptions);
router.get("/photo-reviews/:reviewId", requirePermission(Permission.REVIEW_VIEW), photoController.detail);
router.post("/photo-reviews/:reviewId/uploads", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, photoController.beginUpload);
router.post("/photo-reviews/:reviewId/uploads/:assetId/finalize", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, photoController.finalizeUpload);
router.post("/photo-reviews/:reviewId/submission", requirePermission(Permission.REVIEW_VERIFY), requireReviewOrigin, photoController.submit);

assertRoutesGuarded(router);

export default router;
