import { createHash } from "crypto";
import { ReviewStage } from "@prisma/client";

export type InformationSubmission = {
  expectedVersion: number;
  revisionId: number;
  operationId: string;
};

export function readInformationSubmission(input: unknown): InformationSubmission | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["expectedVersion", "revisionId", "operationId"].includes(key)) ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 ||
      !Number.isSafeInteger(value.revisionId) || Number(value.revisionId) < 1 || Number(value.revisionId) > 2147483647 ||
      typeof value.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId)) return null;
  return {
    expectedVersion: Number(value.expectedVersion), revisionId: Number(value.revisionId),
    operationId: value.operationId.toLowerCase(),
  };
}

export function canSubmitInformation(stage: ReviewStage, revisionVersion: number, lastRejectionVersion: number | null) {
  if (stage === ReviewStage.DRAFT) return true;
  return (stage === ReviewStage.REJECTED_QC || stage === ReviewStage.REJECTED_MODERATOR) &&
    lastRejectionVersion !== null && revisionVersion > lastRejectionVersion;
}

export function submissionHash(reviewId: number, input: InformationSubmission) {
  return createHash("sha256").update(JSON.stringify([
    reviewId, input.expectedVersion, input.revisionId,
  ])).digest("hex");
}
