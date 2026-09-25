import { InformationEventAction, Prisma, ReviewCapability, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { profileHash } from "./information_draft_contract";
import { assignedTrack, snapshot } from "./information_draft_service";
import { ReviewRequestError } from "./review_error";
import { qcRequestHash, qcTransition, type InformationQcRequest } from "./information_qc_contract";

export async function decideInformationQc(adminId: number, reviewId: number, input: InformationQcRequest) {
  const requestHash = qcRequestHash(reviewId, input);
  try {
    return await prisma.$transaction(async tx => {
      await assignedTrack(tx, adminId, reviewId, [ReviewCapability.INFORMATION_QC]);
      const rows = await tx.$queryRaw<{ student_id: number }[]>`
        SELECT s.id AS student_id FROM "ReviewTrack" t
        JOIN "ReviewCase" c ON c.id = t.case_id
        JOIN "Student" s ON s.id = c.student_id
        WHERE t.id = ${reviewId} AND t.type = 'INFORMATION'
        FOR UPDATE OF s`;
      if (rows.length !== 1) throw new ReviewRequestError(404, "NOT_FOUND", "Information review not found.");
      const { track, student } = await assignedTrack(tx, adminId, reviewId, [ReviewCapability.INFORMATION_QC]);

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
        throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before deciding.");
      }
      const transition = qcTransition(track.stage, input.decision);
      if (!transition) throw new ReviewRequestError(409, "STAGE_CHANGED", "This QC action is no longer available.");
      const submission = await tx.informationReviewEvent.findFirst({
        where: { track_id: reviewId, action: InformationEventAction.SUBMITTED_QC },
        orderBy: { track_version: "desc" }, select: { revision_id: true },
      });
      const latestRevision = await tx.reviewRevision.findFirst({
        where: { track_id: reviewId }, orderBy: { track_version: "desc" },
        select: { id: true, canonical_hash: true },
      });
      if (!submission || !latestRevision || submission.revision_id !== input.revisionId ||
          latestRevision.id !== input.revisionId) {
        throw new ReviewRequestError(409, "STALE_REVISION", "The submitted revision changed. Refresh before deciding.");
      }
      if (latestRevision.canonical_hash !== profileHash(snapshot(student))) {
        throw new ReviewRequestError(409, "SOURCE_CHANGED", "The live profile changed. A moderator must reconcile it before QC can continue.");
      }

      const operation = await tx.reviewOperation.create({
        data: { actor_id: adminId, client_key: input.operationId, request_hash: requestHash },
        select: { id: true },
      });
      const updated = await tx.reviewTrack.updateMany({
        where: { id: reviewId, type: ReviewTrackType.INFORMATION, version: track.version, stage: track.stage },
        data: { stage: transition.toStage, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before deciding.");
      const version = track.version + 1;
      await tx.informationReviewEvent.create({
        data: {
          track_id: reviewId, track_version: version, revision_id: input.revisionId,
          actor_id: adminId, operation_id: operation.id,
          action: transition.action, from_stage: track.stage, to_stage: transition.toStage,
          note: input.reason,
        },
      });
      const response = { success: true, reviewId, revisionId: input.revisionId, version, stage: transition.toStage };
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
      throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before deciding.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2034"].includes(error.code)) {
      throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before deciding.");
    }
    throw error;
  }
}

export async function informationDecisionHistory(adminId: number, reviewId: number) {
  await assignedTrack(prisma, adminId, reviewId, [
    ReviewCapability.INFORMATION_PROOFREADER, ReviewCapability.INFORMATION_QC, ReviewCapability.FINAL_MODERATOR,
  ]);
  const events = await prisma.informationReviewEvent.findMany({
    where: { track_id: reviewId }, orderBy: { track_version: "desc" }, take: 30,
    select: {
      id: true, track_version: true, revision_id: true, action: true,
      from_stage: true, to_stage: true, note: true, created_at: true,
      actor: { select: { first_name: true, last_name: true } },
    },
  });
  return { success: true, events };
}
