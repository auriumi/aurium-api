import { InformationEventAction, Prisma, ReviewCapability, ReviewStage, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { profileHash } from "./information_draft_contract";
import { assignedTrack, snapshot } from "./information_draft_service";
import { ReviewRequestError } from "./review_error";
import { canSubmitInformation, submissionHash, type InformationSubmission } from "./information_submission_contract";

export async function submitInformationReview(adminId: number, reviewId: number, input: InformationSubmission) {
  const requestHash = submissionHash(reviewId, input);
  try {
    return await prisma.$transaction(async tx => {
      await assignedTrack(tx, adminId, reviewId, [ReviewCapability.INFORMATION_PROOFREADER]);
      const rows = await tx.$queryRaw<{ student_id: number }[]>`
        SELECT s.id AS student_id FROM "ReviewTrack" t
        JOIN "ReviewCase" c ON c.id = t.case_id
        JOIN "Student" s ON s.id = c.student_id
        WHERE t.id = ${reviewId} AND t.type = 'INFORMATION'
        FOR UPDATE OF s`;
      if (rows.length !== 1) throw new ReviewRequestError(404, "NOT_FOUND", "Information review not found.");
      const { track, student } = await assignedTrack(tx, adminId, reviewId, [ReviewCapability.INFORMATION_PROOFREADER]);

      const previousOperation = await tx.reviewOperation.findUnique({
        where: { actor_id_client_key: { actor_id: adminId, client_key: input.operationId } },
        select: { request_hash: true, response: true },
      });
      if (previousOperation) {
        if (previousOperation.request_hash !== requestHash) {
          throw new ReviewRequestError(409, "OPERATION_REUSED", "This request ID was used for another action.");
        }
        if (!previousOperation.response) {
          throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "This action did not complete. Refresh and try again.");
        }
        return previousOperation.response;
      }

      if (track.version !== input.expectedVersion) {
        throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before submitting.");
      }
      const latest = await tx.reviewRevision.findFirst({
        where: { track_id: reviewId }, orderBy: { track_version: "desc" },
        select: { id: true, track_version: true, canonical_hash: true },
      });
      if (!latest || latest.id !== input.revisionId) {
        throw new ReviewRequestError(409, "STALE_REVISION", "Save and review the latest correction before submitting.");
      }
      const lastRejection = await tx.informationReviewEvent.findFirst({
        where: { track_id: reviewId, action: { in: [
          InformationEventAction.REJECTED_QC, InformationEventAction.REJECTED_MODERATOR,
        ] } },
        orderBy: { track_version: "desc" }, select: { track_version: true },
      });
      if (!canSubmitInformation(track.stage, latest.track_version, lastRejection?.track_version ?? null)) {
        throw new ReviewRequestError(409, "STAGE_CHANGED", "A returned review needs a new saved correction before resubmission.");
      }
      if (latest.canonical_hash !== profileHash(snapshot(student))) {
        throw new ReviewRequestError(409, "SOURCE_CHANGED", "The live profile changed. A moderator must reconcile it before submission.");
      }

      const operation = await tx.reviewOperation.create({
        data: { actor_id: adminId, client_key: input.operationId, request_hash: requestHash },
        select: { id: true },
      });
      const updated = await tx.reviewTrack.updateMany({
        where: { id: reviewId, type: ReviewTrackType.INFORMATION, version: track.version, stage: track.stage },
        data: { stage: ReviewStage.SUBMITTED_QC, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before submitting.");
      const version = track.version + 1;
      await tx.informationReviewEvent.create({
        data: {
          track_id: reviewId, track_version: version, revision_id: latest.id,
          actor_id: adminId, operation_id: operation.id,
          action: InformationEventAction.SUBMITTED_QC,
          from_stage: track.stage, to_stage: ReviewStage.SUBMITTED_QC,
        },
      });
      const response = { success: true, reviewId, revisionId: latest.id, version, stage: ReviewStage.SUBMITTED_QC };
      await tx.reviewOperation.update({ where: { id: operation.id }, data: { response } });
      return response;
    }, { maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const previous = await prisma.reviewOperation.findUnique({
        where: { actor_id_client_key: { actor_id: adminId, client_key: input.operationId } },
        select: { request_hash: true, response: true },
      });
      if (previous) {
        if (previous.request_hash !== requestHash) throw new ReviewRequestError(409, "OPERATION_REUSED", "This request ID was used for another action.");
        if (previous.response) return previous.response;
      }
      throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before submitting.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2034"].includes(error.code)) {
      throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before submitting.");
    }
    throw error;
  }
}
