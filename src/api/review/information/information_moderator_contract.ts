import { createHash } from "crypto";
import { InformationEventAction, Prisma, ReviewStage } from "@prisma/client";
import { validEditableProfile, type EditableProfile } from "./information_draft_contract";

export type ModeratorDecision = "APPROVE" | "REJECT";
export type InformationModeratorRequest = {
  expectedVersion: number;
  revisionId: number;
  operationId: string;
  decision: ModeratorDecision;
  reason: string | null;
};

export function readInformationModeratorRequest(input: unknown): InformationModeratorRequest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["expectedVersion", "revisionId", "operationId", "decision", "reason"].includes(key)) ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 ||
      !Number.isSafeInteger(value.revisionId) || Number(value.revisionId) < 1 || Number(value.revisionId) > 2147483647 ||
      typeof value.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId) ||
      (value.decision !== "APPROVE" && value.decision !== "REJECT")) return null;
  const reason = value.reason === undefined || value.reason === null ? null : value.reason;
  if (reason !== null && (typeof reason !== "string" || reason !== reason.trim() ||
      !reason || reason.length > 2000 || /[\u0000-\u001f\u007f]/.test(reason))) return null;
  if ((value.decision === "REJECT") !== (reason !== null)) return null;
  return {
    expectedVersion: Number(value.expectedVersion), revisionId: Number(value.revisionId),
    operationId: value.operationId.toLowerCase(), decision: value.decision, reason: reason as string | null,
  };
}

export function moderatorTransition(stage: ReviewStage, decision: ModeratorDecision) {
  if (stage !== ReviewStage.SUBMITTED_MODERATOR) return null;
  return decision === "REJECT"
    ? { action: InformationEventAction.REJECTED_MODERATOR, toStage: ReviewStage.REJECTED_MODERATOR }
    : { action: InformationEventAction.LOCKED, toStage: ReviewStage.LOCKED };
}

export function moderatorRequestHash(reviewId: number, input: InformationModeratorRequest) {
  return createHash("sha256").update(JSON.stringify([
    reviewId, input.expectedVersion, input.revisionId, input.decision, input.reason,
  ])).digest("hex");
}

// Snapshots are JSON in the database. Validate again at the publication boundary.
export function publishableProfile(profile: EditableProfile) {
  return validEditableProfile(profile);
}

export function publicationChanges(before: EditableProfile, after: EditableProfile) {
  const student: Prisma.StudentUncheckedUpdateInput = {};
  const detail: Prisma.StudentDetailUncheckedUpdateInput = {};
  if (before.firstName !== after.firstName) student.first_name = after.firstName;
  if (before.middleName !== after.middleName) student.mid_name = after.middleName;
  if (before.lastName !== after.lastName) student.last_name = after.lastName;
  if (before.suffix !== after.suffix) student.suffix = after.suffix;
  if (before.nickname !== after.nickname) student.nickname = after.nickname;
  if (before.department !== after.department) student.department = after.department;
  if (before.program !== after.program) student.course = after.program;
  if (before.major !== after.major) student.major = after.major;
  if (before.thesisTitle !== after.thesisTitle) student.thesis_title = after.thesisTitle;
  if (before.birthDate !== after.birthDate) detail.birth_date = new Date(`${after.birthDate}T00:00:00.000Z`);
  if (before.contactNumber !== after.contactNumber) detail.contact_num = after.contactNumber;
  if (before.province !== after.province) detail.province = after.province;
  if (before.city !== after.city) detail.city = after.city;
  if (before.barangay !== after.barangay) detail.barangay = after.barangay;
  if (before.mothersName !== after.mothersName) detail.mothers_name = after.mothersName;
  if (before.mothersTitle !== after.mothersTitle) detail.mothers_title = after.mothersTitle;
  if (before.fathersName !== after.fathersName) detail.fathers_name = after.fathersName;
  if (before.fathersTitle !== after.fathersTitle) detail.fathers_title = after.fathersTitle;
  if (before.guardiansName !== after.guardiansName) detail.guardians_name = after.guardiansName;
  if (before.guardiansTitle !== after.guardiansTitle) detail.guardians_title = after.guardiansTitle;
  return { student, detail };
}
