import { Request, Response } from "express";
import { readCycle } from "./rac_contract";
import { informationQueues, type InformationQueue } from "./information_contract";
import { informationFilterOptions, informationReviewDetail, listInformationReviews } from "./information_service";
import { readDraftSave } from "./information_draft_contract";
import { informationDraftHistory, saveInformationDraft } from "./information_draft_service";
import { ReviewRequestError } from "./review_error";

interface StaffRequest extends Request {
  user?: { admin_id?: string | number };
}

function staffId(req: StaffRequest) {
  const id = Number(req.user?.admin_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function readText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed || null : undefined;
}

function sendError(error: unknown, res: Response, label: string) {
  if (error instanceof ReviewRequestError) {
    return res.status(error.status).json({ success: false, code: error.code, reason: error.message });
  }
  console.error(label, error);
  return res.status(500).json({ success: false, code: "INTERNAL_ERROR", reason: "Internal Server Error" });
}

export async function listReviews(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  if (!adminId) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  const cycle = readCycle(req.query.year, req.query.term);
  const page = Number(req.query.page ?? 1);
  const queue = req.query.queue ?? "ALL";
  const department = readText(req.query.department, 120);
  const course = readText(req.query.program, 120);
  const major = readText(req.query.major, 120);
  const search = readText(req.query.search, 80);
  if (!cycle || !Number.isSafeInteger(page) || page < 1 || page > 10000 ||
      typeof queue !== "string" || !informationQueues.includes(queue as InformationQueue) ||
      department === undefined || course === undefined || major === undefined || search === undefined ||
      (course && !department) || (major && !course)) {
    return res.status(400).json({ success: false, code: "INVALID_FILTER", reason: "Invalid information filters." });
  }
  try {
    return res.json(await listInformationReviews(adminId, {
      ...cycle, page, queue: queue as InformationQueue, department, course, major, search: search ?? "",
    }));
  } catch (error) { return sendError(error, res, "Information list error:"); }
}

export async function getFilterOptions(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  if (!adminId) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  const cycle = readCycle(req.query.year, req.query.term);
  const department = readText(req.query.department, 120);
  const course = readText(req.query.program, 120);
  if (!cycle || department === undefined || course === undefined || (course && !department)) {
    return res.status(400).json({ success: false, code: "INVALID_FILTER", reason: "Invalid academic filters." });
  }
  try { return res.json(await informationFilterOptions(adminId, cycle, department, course)); }
  catch (error) { return sendError(error, res, "Information options error:"); }
}

export async function getReview(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  if (!adminId) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  const reviewId = Number(req.params.reviewId);
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0 || reviewId > 2147483647) {
    return res.status(400).json({ success: false, code: "INVALID_REQUEST", reason: "Invalid review ID." });
  }
  try { return res.json(await informationReviewDetail(adminId, reviewId)); }
  catch (error) { return sendError(error, res, "Information detail error:"); }
}

export async function getDraftHistory(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  if (!adminId) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  const reviewId = Number(req.params.reviewId);
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0 || reviewId > 2147483647) {
    return res.status(400).json({ success: false, code: "INVALID_REQUEST", reason: "Invalid review ID." });
  }
  try { return res.json(await informationDraftHistory(adminId, reviewId)); }
  catch (error) { return sendError(error, res, "Information revision history error:"); }
}

export async function saveDraft(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  if (!adminId) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  const reviewId = Number(req.params.reviewId);
  const draft = readDraftSave(req.body);
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0 || reviewId > 2147483647 || !draft) {
    return res.status(400).json({ success: false, code: "INVALID_REQUEST", reason: "Invalid draft change." });
  }
  try { return res.json(await saveInformationDraft(adminId, reviewId, draft)); }
  catch (error) { return sendError(error, res, "Information draft save error:"); }
}
