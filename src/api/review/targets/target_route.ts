import { Router, Request, Response } from "express";
import { requirePermission } from "../../auth/auth_middleware";
import { Permission } from "../../auth/permissions";
import { assertRoutesGuarded } from "../../auth/route_guard_audit";
import { requireReviewOrigin } from "../shared/review_origin";
import { ReviewRequestError } from "../shared/review_error";
import { readCycle } from "../rac/rac_contract";
import { manilaDate, readTargetBatch, readTargetRole, validDate } from "./target_contract";
import { listTargets, myProgress, saveTargets, targetHistory, targetSchedule } from "./target_service";

const router = Router();
type StaffRequest = Request & { user?: { admin_id?: string | number } };
function handle(action: (id: number, req: Request) => Promise<unknown>) {
  return async (req: StaffRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const id = Number(req.user?.admin_id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(401).json({ success: false, reason: "Unauthorized." });
    try { return res.json(await action(id, req)); }
    catch (error) {
      if (error instanceof ReviewRequestError) return res.status(error.status).json({ success: false, code: error.code, reason: error.message });
      console.error("Daily proofreading targets request failed:", error);
      return res.status(500).json({ success: false, reason: "Unable to load or save daily targets. Please try again." });
    }
  };
}
function filters(req: Request) {
  const cycle = readCycle(req.query.year, req.query.term);
  const date = req.query.date ?? manilaDate();
  if (!cycle || !validDate(date)) throw new ReviewRequestError(400, "INVALID_FILTER", "Choose a valid graduation cycle and date.");
  const role = readTargetRole(req.query.role ?? "INFORMATION_PROOFREADER");
  if (!role) throw new ReviewRequestError(400, "INVALID_ROLE", "Choose a supported workflow role.");
  return { cycle, date, role };
}
function page(req: Request) {
  const value = req.query.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000) throw new ReviewRequestError(400, "INVALID_PAGE", "Invalid page.");
  return value;
}
router.get("/me", requirePermission(Permission.REVIEW_VIEW), handle(async (id, req) => {
  const { cycle, date, role } = filters(req); return myProgress(id, cycle, date, role);
}));
router.get("/schedule", requirePermission(Permission.REVIEW_ASSIGN), handle(async (id, req) => {
  const { cycle, role } = filters(req);
  if (typeof req.query.staffIds !== "string" || typeof req.query.dates !== "string" ||
      req.query.staffIds.length > 1200 || req.query.dates.length > 1200) {
    throw new ReviewRequestError(400, "INVALID_SELECTION", "Choose staff and dates.");
  }
  const staffIds = req.query.staffIds.split(",").map(Number), dates = req.query.dates.split(",");
  if (!staffIds.length || !dates.length || staffIds.length * dates.length > 100 ||
      staffIds.some(v => !Number.isSafeInteger(v) || v < 1 || v > 2147483647) || dates.some(d => !validDate(d)) ||
      new Set(staffIds).size !== staffIds.length || new Set(dates).size !== dates.length) {
    throw new ReviewRequestError(400, "INVALID_SELECTION", "Choose at most 100 unique staff/date combinations.");
  }
  return targetSchedule(id, cycle, staffIds, dates, role);
}));
router.get("/", requirePermission(Permission.REVIEW_ASSIGN), handle(async (id, req) => {
  const { cycle, date, role } = filters(req);
  const search = req.query.search ?? "", department = req.query.department ?? "";
  if (typeof search !== "string" || search.length > 120 || typeof department !== "string" || department.length > 200) {
    throw new ReviewRequestError(400, "INVALID_FILTER", "Invalid staff search or department.");
  }
  return listTargets(id, cycle, date, page(req), search.trim(), department, role);
}));
router.get("/:id/history", requirePermission(Permission.REVIEW_ASSIGN), handle(async (id, req) => {
  const targetId = Number(req.params.id);
  if (!Number.isSafeInteger(targetId) || targetId < 1) throw new ReviewRequestError(400, "INVALID_ID", "Invalid target.");
  return targetHistory(id, targetId, page(req));
}));
router.put("/", requirePermission(Permission.REVIEW_ASSIGN), requireReviewOrigin, handle(async (id, req) => {
  const batch = readTargetBatch(req.body);
  if (!batch) throw new ReviewRequestError(400, "INVALID_TARGET", "Use whole-number targets from 0 to 10,000 and at most 100 staff/date entries.");
  return saveTargets(id, batch);
}));
assertRoutesGuarded(router);
export default router;
