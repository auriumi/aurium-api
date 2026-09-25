import { Request, Response } from "express";
import { RacOutcome } from "@prisma/client";
import { readCycle, readVerificationBatch, type VerificationStatus } from "./rac_contract";
import { listVerificationGraduates, ReviewRequestError, verificationFilterOptions, verificationHistory, verifyGraduateBatch } from "./rac_service";

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

export async function listGraduates(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  if (!adminId) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  const cycle = readCycle(req.query.year, req.query.term);
  const page = Number(req.query.page ?? 1);
  const status = req.query.verification ?? "UNCHECKED";
  const department = readText(req.query.department, 120);
  const course = readText(req.query.program, 120);
  const major = readText(req.query.major, 120);
  const search = readText(req.query.search, 80);
  if (!cycle || !Number.isSafeInteger(page) || page < 1 || page > 10000 ||
      typeof status !== "string" || !["ALL", "UNCHECKED", ...Object.values(RacOutcome)].includes(status) ||
      department === undefined || course === undefined || major === undefined || search === undefined ||
      (course && !department) || (major && !course)) {
    return res.status(400).json({ success: false, code: "INVALID_FILTER", reason: "Invalid review filters." });
  }
  try {
    const result = await listVerificationGraduates(adminId, {
      ...cycle, page, status: status as VerificationStatus, department, course, major, search: search ?? "",
    });
    return res.json(result);
  } catch (error) { return sendError(error, res, "RAC list error:"); }
}

export async function getHistory(req: StaffRequest, res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
  const adminId = staffId(req);
  if (!adminId) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  const cycle = readCycle(req.query.year, req.query.term);
  const studentNumber = Number(req.params.studentNumber);
  if (!cycle || !Number.isSafeInteger(studentNumber) || studentNumber <= 0 || studentNumber > 2147483647) {
    return res.status(400).json({ success: false, code: "INVALID_REQUEST", reason: "Invalid graduate or cycle." });
  }
  try { return res.json(await verificationHistory(adminId, studentNumber, cycle)); }
  catch (error) { return sendError(error, res, "RAC history error:"); }
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
  try { return res.json(await verificationFilterOptions(adminId, cycle, department, course)); }
  catch (error) { return sendError(error, res, "RAC filter options error:"); }
}

export async function createVerificationBatch(req: StaffRequest, res: Response) {
  const adminId = staffId(req);
  if (!adminId) return res.status(401).json({ success: false, code: "UNAUTHORIZED", reason: "Unauthorized." });
  const batch = readVerificationBatch(req.body);
  if (!batch) return res.status(400).json({ success: false, code: "INVALID_REQUEST", reason: "Select 1–100 eligible graduates and refresh the list." });
  try { return res.json(await verifyGraduateBatch(adminId, batch)); }
  catch (error) { return sendError(error, res, "RAC verification error:"); }
}
