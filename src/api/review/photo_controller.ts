import { Request, Response } from "express";
import { ReviewStage } from "@prisma/client";
import { readCycle } from "./rac_contract";
import { readPhotoFinalize, readPhotoSubmission, readPhotoUpload } from "./photo_contract";
import { beginPhotoUpload, finalizePhotoUpload, listPhotoReviews, photoFilterOptions, photoReviewDetail, submitPhotoPair } from "./photo_service";
import { readPhotoDecision } from "./photo_decision_contract";
import { decidePhotoReview, photoDecisionHistory } from "./photo_decision_service";
import { ReviewRequestError } from "./review_error";

interface StaffRequest extends Request { user?: { admin_id?: string | number } }
const staffId = (req: StaffRequest) => Number(req.user?.admin_id);
const validId = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

function fail(error: unknown, res: Response, label: string) {
  if (error instanceof ReviewRequestError) {
    return res.status(error.status).json({ success: false, code: error.code, reason: error.message });
  }
  console.error(label, error);
  return res.status(500).json({ success: false, code: "INTERNAL_ERROR", reason: "Internal Server Error" });
}

export async function list(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  const cycle = readCycle(req.query.year, req.query.term);
  const page = Number(req.query.page ?? 1);
  const search = req.query.search ?? "";
  const department = req.query.department ?? null;
  const course = req.query.program ?? null;
  const major = req.query.major ?? null;
  const stage = req.query.stage ?? "ALL";
  if (!validId(adminId)) return res.status(401).json({ success: false, reason: "Unauthorized." });
  if (!cycle || !Number.isSafeInteger(page) || page < 1 || page > 10000 ||
      typeof search !== "string" || search.length > 80 ||
      [department, course, major].some(value => value !== null &&
        (typeof value !== "string" || !value.trim() || value.length > 120)) ||
      (stage !== "ALL" && !Object.values(ReviewStage).includes(stage as ReviewStage))) {
    return res.status(400).json({ success: false, code: "INVALID_FILTER", reason: "Invalid photo filters." });
  }
  try { return res.json(await listPhotoReviews(adminId, cycle, page, search,
    department as string | null, course as string | null, major as string | null, stage as ReviewStage | "ALL")); }
  catch (error) { return fail(error, res, "Photo list error:"); }
}

export async function detail(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  const reviewId = Number(req.params.reviewId);
  if (!validId(adminId)) return res.status(401).json({ success: false, reason: "Unauthorized." });
  if (!validId(reviewId)) return res.status(400).json({ success: false, reason: "Invalid review ID." });
  try { return res.json(await photoReviewDetail(adminId, reviewId)); }
  catch (error) { return fail(error, res, "Photo detail error:"); }
}

export async function filterOptions(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  const cycle = readCycle(req.query.year, req.query.term);
  const department = req.query.department ?? null;
  const course = req.query.program ?? null;
  if (!validId(adminId)) return res.status(401).json({ success: false, reason: "Unauthorized." });
  if (!cycle || [department, course].some(value => value !== null &&
    (typeof value !== "string" || !value.trim() || value.length > 120))) {
    return res.status(400).json({ success: false, reason: "Invalid academic filters." });
  }
  try { return res.json(await photoFilterOptions(adminId, cycle, department as string | null, course as string | null)); }
  catch (error) { return fail(error, res, "Photo filter error:"); }
}

export async function beginUpload(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  const reviewId = Number(req.params.reviewId);
  const input = readPhotoUpload(req.body);
  if (!validId(adminId)) return res.status(401).json({ success: false, reason: "Unauthorized." });
  if (!validId(reviewId) || !input) return res.status(400).json({ success: false, reason: "Invalid photo upload." });
  try { return res.status(201).json(await beginPhotoUpload(adminId, reviewId, input)); }
  catch (error) { return fail(error, res, "Photo upload begin error:"); }
}

export async function finalizeUpload(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  const reviewId = Number(req.params.reviewId);
  const assetId = Number(req.params.assetId);
  const input = readPhotoFinalize(req.body);
  if (!validId(adminId)) return res.status(401).json({ success: false, reason: "Unauthorized." });
  if (!validId(reviewId) || !validId(assetId) || !input) {
    return res.status(400).json({ success: false, reason: "Invalid photo finalization." });
  }
  try { return res.json(await finalizePhotoUpload(adminId, reviewId, assetId, input.expectedVersion)); }
  catch (error) { return fail(error, res, "Photo upload finalize error:"); }
}

export async function submit(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  const reviewId = Number(req.params.reviewId);
  const input = readPhotoSubmission(req.body);
  if (!validId(adminId)) return res.status(401).json({ success: false, reason: "Unauthorized." });
  if (!validId(reviewId) || !input) return res.status(400).json({ success: false, reason: "Invalid photo submission." });
  try { return res.json(await submitPhotoPair(adminId, reviewId, input)); }
  catch (error) { return fail(error, res, "Photo submission error:"); }
}

export async function decisionHistory(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  const reviewId = Number(req.params.reviewId);
  if (!validId(adminId)) return res.status(401).json({ success: false, reason: "Unauthorized." });
  if (!validId(reviewId)) return res.status(400).json({ success: false, reason: "Invalid review ID." });
  try { return res.json(await photoDecisionHistory(adminId, reviewId)); }
  catch (error) { return fail(error, res, "Photo history error:"); }
}

export function qcDecision(req: StaffRequest, res: Response) {
  return decision(req, res, "qc");
}

export function moderatorDecision(req: StaffRequest, res: Response) {
  return decision(req, res, "moderator");
}

async function decision(req: StaffRequest, res: Response, role: "qc" | "moderator") {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  const reviewId = Number(req.params.reviewId);
  const input = readPhotoDecision(req.body, role);
  if (!validId(adminId)) return res.status(401).json({ success: false, reason: "Unauthorized." });
  if (!validId(reviewId) || !input) return res.status(400).json({ success: false, reason: "Invalid photo decision." });
  try { return res.json(await decidePhotoReview(adminId, reviewId, role, input)); }
  catch (error) { return fail(error, res, "Photo decision error:"); }
}
