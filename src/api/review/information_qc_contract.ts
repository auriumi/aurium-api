import { createHash } from "crypto";
import { InformationEventAction, ReviewStage } from "@prisma/client";

export const qcDecisions = ["APPROVE", "REJECT", "FORWARD"] as const;
export type QcDecision = typeof qcDecisions[number];
export type InformationQcRequest = {
  expectedVersion: number;
  revisionId: number;
  operationId: string;
  decision: QcDecision;
  reason: string | null;
};

export function readInformationQcRequest(input: unknown): InformationQcRequest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["expectedVersion", "revisionId", "operationId", "decision", "reason"].includes(key)) ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 ||
      !Number.isSafeInteger(value.revisionId) || Number(value.revisionId) < 1 || Number(value.revisionId) > 2147483647 ||
      typeof value.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId) ||
      typeof value.decision !== "string" || !qcDecisions.includes(value.decision as QcDecision)) return null;

  const reason = value.reason === undefined || value.reason === null ? null : value.reason;
  if (reason !== null && (typeof reason !== "string" || reason !== reason.trim() ||
      !reason || reason.length > 2000 || /[\u0000-\u001f\u007f]/.test(reason))) return null;
  if ((value.decision === "REJECT") !== (reason !== null)) return null;
  return {
    expectedVersion: Number(value.expectedVersion), revisionId: Number(value.revisionId),
    operationId: value.operationId.toLowerCase(), decision: value.decision as QcDecision,
    reason: reason as string | null,
  };
}

export function qcTransition(stage: ReviewStage, decision: QcDecision) {
  if (stage === ReviewStage.SUBMITTED_QC && decision === "APPROVE") {
    return { action: InformationEventAction.APPROVED_QC, toStage: ReviewStage.APPROVED_QC };
  }
  if (stage === ReviewStage.SUBMITTED_QC && decision === "REJECT") {
    return { action: InformationEventAction.REJECTED_QC, toStage: ReviewStage.REJECTED_QC };
  }
  if (stage === ReviewStage.APPROVED_QC && decision === "FORWARD") {
    return { action: InformationEventAction.SUBMITTED_MODERATOR, toStage: ReviewStage.SUBMITTED_MODERATOR };
  }
  return null;
}

export function qcRequestHash(reviewId: number, input: InformationQcRequest) {
  return createHash("sha256").update(JSON.stringify([
    reviewId, input.expectedVersion, input.revisionId, input.decision, input.reason,
  ])).digest("hex");
}
