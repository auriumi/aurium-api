import { Router } from "express";
import { requirePermission } from "../auth/auth_middleware";
import { Permission } from "../auth/permissions";
import { assertRoutesGuarded } from "../auth/route_guard_audit";
import * as controller from "./review_controller";
import * as racController from "./rac_controller";
import * as informationController from "./information_controller";
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
router.get("/information-reviews/:reviewId", requirePermission(Permission.REVIEW_VIEW), informationController.getReview);

assertRoutesGuarded(router);

export default router;
