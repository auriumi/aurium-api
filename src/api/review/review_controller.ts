import { Request, Response } from "express";
import { activeAssignments, grantAssignment, revokeAssignment } from "./review_access";
import { listReviewStaff } from "./staff_assignment_service";
import { ReviewRequestError } from "./review_error";

export async function getReviewStaff(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const id = staffId(req);
  if (!id) return res.status(401).json({ success: false, reason: "Unauthorized." });
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const search = req.query.search === undefined ? '' : req.query.search;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || typeof search !== 'string' || search.length > 120) {
    return res.status(400).json({ success: false, reason: "Invalid search or page." });
  }
  try {
    return res.json(await listReviewStaff(id, search.trim(), page));
  } catch (error) {
    if (error instanceof ReviewRequestError) return res.status(error.status).json({ success: false, reason: error.message });
    console.error("Failed to load review staff:", error);
    return res.status(500).json({ success: false, reason: "Unable to load staff." });
  }
}

interface StaffRequest extends Request {
  user?: { admin_id?: string | number };
}

function staffId(req: StaffRequest) {
  const id = Number(req.user?.admin_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function getCapabilities(req: StaffRequest, res: Response) {
  const id = staffId(req);
  if (!id) return res.status(401).json({ success: false, reason: "Unauthorized." });
  try {
    const assignments = await activeAssignments(id);
    if (!assignments) return res.status(403).json({ success: false, reason: "Staff account unavailable." });
    return res.json({ success: true, assignments });
  } catch (error) {
    console.error("Failed to load review capabilities:", error);
    return res.status(500).json({ success: false, reason: "Internal Server Error" });
  }
}

export async function createAssignment(req: StaffRequest, res: Response) {
  const id = staffId(req);
  if (!id) return res.status(401).json({ success: false, reason: "Unauthorized." });
  try {
    const result = await grantAssignment(id, req.body);
    return res.status(result.status).json(result.status === 201 && 'assignment' in result
      ? { success: true, assignment: result.assignment }
      : { success: false, reason: result.reason });
  } catch (error) {
    console.error("Failed to grant review assignment:", error);
    return res.status(500).json({ success: false, reason: "Internal Server Error" });
  }
}

export async function deactivateAssignment(req: StaffRequest, res: Response) {
  const id = staffId(req);
  if (!id) return res.status(401).json({ success: false, reason: "Unauthorized." });
  const assignmentId = Number(req.params.id);
  if (!Number.isSafeInteger(assignmentId) || assignmentId <= 0 ||
      req.body?.active !== false || Object.keys(req.body ?? {}).length !== 1) {
    return res.status(400).json({ success: false, reason: "Use active: false for a valid assignment." });
  }
  try {
    const result = await revokeAssignment(id, assignmentId);
    return res.status(result.status).json(result.status === 200
      ? { success: true }
      : { success: false, reason: result.reason });
  } catch (error) {
    console.error("Failed to revoke review assignment:", error);
    return res.status(500).json({ success: false, reason: "Internal Server Error" });
  }
}
