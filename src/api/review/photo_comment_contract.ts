import { createHash } from "node:crypto";
import { ReviewStage } from "@prisma/client";

export type PhotoComment = {
  expectedVersion: number;
  pairRevisionId: number | null;
  operationId: string;
  note: string;
};

export function readPhotoComment(input: unknown): PhotoComment | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["expectedVersion", "pairRevisionId", "operationId", "note"].includes(key)) ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 ||
      (value.pairRevisionId !== null && (!Number.isSafeInteger(value.pairRevisionId) ||
        Number(value.pairRevisionId) < 1 || Number(value.pairRevisionId) > 2147483647)) ||
      typeof value.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId) ||
      typeof value.note !== "string" || value.note !== value.note.trim() ||
      value.note.length < 1 || value.note.length > 2000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.note)) return null;
  return { expectedVersion: Number(value.expectedVersion),
    pairRevisionId: value.pairRevisionId === null ? null : Number(value.pairRevisionId),
    operationId: value.operationId.toLowerCase(), note: value.note };
}

export function matchesPhotoCommentContext(stage: ReviewStage, latestPairId: number | null,
  requestedPairId: number | null) {
  // Pending uploads may have no complete pair yet; decisions always require one.
  return latestPairId === requestedPairId && (latestPairId !== null || stage === ReviewStage.DRAFT);
}

export function photoCommentHash(reviewId: number, input: PhotoComment) {
  return createHash("sha256").update(JSON.stringify([
    reviewId, input.expectedVersion, input.pairRevisionId, input.note,
  ])).digest("hex");
}
