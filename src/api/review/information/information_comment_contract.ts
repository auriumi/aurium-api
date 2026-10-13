import { createHash } from "node:crypto";
import { ReviewStage } from "@prisma/client";

export type InformationComment = { expectedVersion: number; revisionId: number | null; operationId: string; note: string };

export function readInformationComment(input: unknown): InformationComment | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["expectedVersion", "revisionId", "operationId", "note"].includes(key)) ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 ||
      (value.revisionId !== null && (!Number.isSafeInteger(value.revisionId) || Number(value.revisionId) < 1 || Number(value.revisionId) > 2147483647)) ||
      typeof value.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId) ||
      typeof value.note !== "string" || value.note !== value.note.trim() ||
      value.note.length < 1 || value.note.length > 2000) return null;
  return { expectedVersion: Number(value.expectedVersion), revisionId: value.revisionId === null ? null : Number(value.revisionId),
    operationId: value.operationId.toLowerCase(), note: value.note };
}

export function matchesInformationCommentContext(stage: ReviewStage, latestRevisionId: number | null, revisionId: number | null) {
  return latestRevisionId === revisionId && (revisionId !== null || stage === ReviewStage.DRAFT);
}

export function commentHash(reviewId: number, input: InformationComment) {
  return createHash("sha256").update(JSON.stringify([reviewId, input.expectedVersion, input.revisionId, input.note])).digest("hex");
}
