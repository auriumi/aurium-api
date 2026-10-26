import targetRoutes from "./targets/target_route";
import { Router } from "express";
import assignmentRoutes from "./assignments/assignment_route";
import racRoutes from "./rac/rac_route";
import informationRoutes from "./information/information_route";
import photoRoutes from "./photos/photo_route";
import correctionRoutes from "./corrections/correction_route";

// Each resource audits its own leaf routes; the guard auditor is not recursive.
// Authentication and rate limiting are applied by the protected server mount.
const router = Router();
router.use("/proofreading-targets", targetRoutes);
router.use(assignmentRoutes);
router.use("/rac", racRoutes);
router.use("/information", informationRoutes);
router.use("/photos", photoRoutes);
router.use(correctionRoutes);

export default router;
