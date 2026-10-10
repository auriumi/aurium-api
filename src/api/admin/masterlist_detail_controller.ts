import { Request, Response } from "express";
import { masterlistDetail } from "./masterlist_detail_service";
import { ReviewRequestError } from "../review/review_error";

export async function getMasterlistDetail(req: Request & { user?: { admin_id?: number | string } }, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const actor = Number(req.user?.admin_id);
  const student = Number(req.params.studentNumber);
  if (!Number.isSafeInteger(actor) || actor <= 0) return res.status(401).json({ success: false, reason: "Unauthorized." });
  if (!Number.isSafeInteger(student) || student <= 0) return res.status(400).json({ success: false, reason: "Invalid student number." });
  try {
    return res.json(await masterlistDetail(actor, student));
  } catch (error) {
    if (error instanceof ReviewRequestError) return res.status(error.status).json({ success: false, reason: error.message });
    console.error("Failed to load masterlist detail:", error);
    return res.status(500).json({ success: false, reason: "Unable to load graduate details. Please try again." });
  }
}
