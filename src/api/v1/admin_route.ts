import { Router } from "express";
import reviewRoutes from "../review/review_route";
import { requirePermission } from "../auth/auth_middleware";
import { Permission } from "../auth/permissions";
import { assertRoutesGuarded } from "../auth/route_guard_audit";
import { getMasterlistDetail } from "../admin/masterlist_detail_controller";

// Version the review release without moving existing registration, booking,
// attendance or authentication endpoints. Compatibility routes share handlers.
const router = Router();
router.use(reviewRoutes);
router.get("/masterlist/:studentNumber", requirePermission(Permission.MASTERLIST_VIEW), getMasterlistDetail);
assertRoutesGuarded(router);
export default router;
