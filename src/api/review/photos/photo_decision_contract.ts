import { createHash } from "node:crypto";
import { PhotoEventAction, ReviewStage } from "@prisma/client";

export type PhotoDecision = "APPROVE" | "REJECT" | "FORWARD";
export type PhotoDecisionRequest = {
  expectedVersion: number;
  pairRevisionId: number;
  operationId: string;
  decision: PhotoDecision;
  reason: string | null;
};

export function readPhotoDecision(input: unknown, role: "qc" | "moderator"): PhotoDecisionRequest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["expectedVersion", "pairRevisionId", "operationId", "decision", "reason"].includes(key)) ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 ||
      !Number.isSafeInteger(value.pairRevisionId) || Number(value.pairRevisionId) < 1 || Number(value.pairRevisionId) > 2147483647 ||
      typeof value.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId) ||
      !["APPROVE", "REJECT", ...(role === "qc" ? ["FORWARD"] : [])].includes(value.decision as string)) return null;
  const reason = value.reason === undefined || value.reason === null ? null : value.reason;
  if (reason !== null && (typeof reason !== "string" || !reason || reason !== reason.trim() ||
      reason.length > 2000 || /[\u0000-\u001f\u007f]/.test(reason))) return null;
  if ((value.decision === "REJECT") !== (reason !== null)) return null;
  return { expectedVersion: Number(value.expectedVersion), pairRevisionId: Number(value.pairRevisionId),
    operationId: value.operationId.toLowerCase(), decision: value.decision as PhotoDecision,
    reason: reason as string | null };
}

export function photoTransition(role: "qc" | "moderator", stage: ReviewStage, decision: PhotoDecision) {
  if (role === "qc") {
    if (stage === ReviewStage.SUBMITTED_QC && decision === "APPROVE") {
      return { action: PhotoEventAction.APPROVED_QC, toStage: ReviewStage.APPROVED_QC };
    }
    if (stage === ReviewStage.SUBMITTED_QC && decision === "REJECT") {
      return { action: PhotoEventAction.REJECTED_QC, toStage: ReviewStage.REJECTED_QC };
    }
    if (stage === ReviewStage.APPROVED_QC && decision === "FORWARD") {
      return { action: PhotoEventAction.SUBMITTED_MODERATOR, toStage: ReviewStage.SUBMITTED_MODERATOR };
    }
  }
  if (role === "moderator" && stage === ReviewStage.SUBMITTED_MODERATOR) {
    if (decision === "APPROVE") return { action: PhotoEventAction.LOCKED, toStage: ReviewStage.LOCKED };
    if (decision === "REJECT") return { action: PhotoEventAction.REJECTED_MODERATOR, toStage: ReviewStage.REJECTED_MODERATOR };
  }
  return null;
}

export function photoDecisionHash(reviewId: number, role: "qc" | "moderator", input: PhotoDecisionRequest) {
  return createHash("sha256").update(JSON.stringify([
    reviewId, role, input.expectedVersion, input.pairRevisionId, input.decision, input.reason,
  ])).digest("hex");
}
