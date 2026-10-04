import { ImageType, ReviewStage } from "@prisma/client";
import { photoMimes, type PhotoMime } from "./photo_storage";
import { readInformationSubmission } from "./information_submission_contract";

export function readPhotoUpload(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["type", "mime", "expectedVersion"].includes(key)) ||
      (value.type !== ImageType.GRADUATION && value.type !== ImageType.THEME) ||
      !photoMimes.includes(value.mime as PhotoMime) ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1) return null;
  return { type: value.type, mime: value.mime as PhotoMime, expectedVersion: Number(value.expectedVersion) };
}

export function readPhotoFinalize(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => key !== "expectedVersion") ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1) return null;
  return { expectedVersion: Number(value.expectedVersion) };
}

export function readPhotoSubmission(input: unknown) {
  const submission = readInformationSubmission(input);
  // Unlike information review, photos always require an uploaded pair.
  return submission && submission.revisionId !== null ? submission : null;
}

export function canSubmitPair(stage: ReviewStage, pairVersion: number | null, trackVersion: number) {
  if (pairVersion === null || pairVersion > trackVersion) return false;
  return stage === ReviewStage.DRAFT || stage === ReviewStage.REJECTED_QC || stage === ReviewStage.REJECTED_MODERATOR;
}
