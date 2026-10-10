import { CorrectionStatus } from "@prisma/client";
import { Request, Response } from "express";
import { readCorrectionDecision, readCorrectionRequest } from "./correction_contract";
import { decideCorrection, listCorrections, requestCorrection } from "./correction_service";
import { ReviewRequestError } from "./review_error";

interface StaffRequest extends Request { user?: { admin_id?: string | number } }
const validId = (value: number) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

function errorResponse(error: unknown, res: Response) {
  if (error instanceof ReviewRequestError) {
    return res.status(error.status).json({ success: false, code: error.code, reason: error.message });
  }
  console.error("Correction request error:", error);
  return res.status(500).json({ success: false, code: "INTERNAL_ERROR", reason: "Internal Server Error" });
}

export async function create(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = Number(req.user?.admin_id);
  const trackId = Number(req.params.trackId);
  const input = readCorrectionRequest(req.body);
  if (!validId(adminId)) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  if (!validId(trackId) || !input) return res.status(400).json({ success: false, code: "INVALID_REQUEST", reason: "Provide a review, version and correction reason." });
  try { return res.status(201).json(await requestCorrection(adminId, trackId, input)); }
  catch (error) { return errorResponse(error, res); }
}

export async function list(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = Number(req.user?.admin_id);
  const page = Number(req.query.page ?? 1);
  const status = req.query.status ?? CorrectionStatus.PENDING;
  if (!validId(adminId)) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 ||
      (status !== "ALL" && !Object.values(CorrectionStatus).includes(status as CorrectionStatus))) {
    return res.status(400).json({ success: false, code: "INVALID_FILTER", reason: "Invalid correction filters." });
  }
  try { return res.json(await listCorrections(adminId, page, status as CorrectionStatus | "ALL")); }
  catch (error) { return errorResponse(error, res); }
}

export async function decide(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = Number(req.user?.admin_id);
  const correctionId = Number(req.params.correctionId);
  const input = readCorrectionDecision(req.body);
  if (!validId(adminId)) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  if (!validId(correctionId) || !input) return res.status(400).json({ success: false, code: "INVALID_REQUEST", reason: "Invalid IT correction decision." });
  try { return res.json(await decideCorrection(adminId, correctionId, input)); }
  catch (error) { return errorResponse(error, res); }
}
