import { InformationEventAction, Prisma, ReviewCapability, ReviewStage, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { assignedTrack } from "./information_draft_service";
import { commentHash, type InformationComment } from "./information_comment_contract";
import { ReviewRequestError } from "./review_error";

const commenters = [ReviewCapability.INFORMATION_PROOFREADER, ReviewCapability.INFORMATION_QC,
  ReviewCapability.FINAL_MODERATOR];

export async function addInformationComment(adminId: number, reviewId: number, input: InformationComment) {
  const requestHash = commentHash(reviewId, input);
  try {
    return await prisma.$transaction(async tx => {
      await assignedTrack(tx, adminId, reviewId, commenters);
      await tx.$queryRaw`SELECT id FROM "ReviewTrack" WHERE id = ${reviewId} FOR UPDATE`;
      const { track } = await assignedTrack(tx, adminId, reviewId, commenters);
      const previous = await tx.reviewOperation.findUnique({ where: {
        actor_id_client_key: { actor_id: adminId, client_key: input.operationId },
      }, select: { request_hash: true, response: true } });
      if (previous) {
        if (previous.request_hash !== requestHash) throw new ReviewRequestError(409, "OPERATION_REUSED", "Request ID was used for another action.");
        if (previous.response) return previous.response;
        throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "Refresh and try again.");
      }
      if (track.stage === ReviewStage.LOCKED) {
        throw new ReviewRequestError(409, "LOCKED", "Completed reviews cannot receive new comments.");
      }
      if (track.version !== input.expectedVersion) {
        throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before commenting.");
      }
      const latest = await tx.reviewRevision.findFirst({ where: { track_id: reviewId },
        orderBy: { track_version: "desc" }, select: { id: true } });
      if (!latest || latest.id !== input.revisionId) {
        throw new ReviewRequestError(409, "STALE_REVISION", "The information revision changed. Refresh before commenting.");
      }
      const operation = await tx.reviewOperation.create({ data: {
        actor_id: adminId, client_key: input.operationId, request_hash: requestHash,
      }, select: { id: true } });
      const changed = await tx.reviewTrack.updateMany({ where: {
        id: reviewId, type: ReviewTrackType.INFORMATION, version: track.version, stage: track.stage,
      }, data: { version: { increment: 1 } } });
      if (changed.count !== 1) throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before commenting.");
      const version = track.version + 1;
      const event = await tx.informationReviewEvent.create({ data: {
        track_id: reviewId, track_version: version, revision_id: latest.id,
        actor_id: adminId, operation_id: operation.id, action: InformationEventAction.COMMENTED,
        from_stage: track.stage, to_stage: track.stage, note: input.note,
      }, select: { id: true } });
      const response = { success: true, eventId: event.id, reviewId, revisionId: latest.id,
        version, stage: track.stage };
      await tx.reviewOperation.update({ where: { id: operation.id }, data: { response } });
      return response;
    }, { maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const previous = await prisma.reviewOperation.findUnique({ where: {
        actor_id_client_key: { actor_id: adminId, client_key: input.operationId },
      }, select: { request_hash: true, response: true } });
      if (previous) {
        if (previous.request_hash !== requestHash) throw new ReviewRequestError(409, "OPERATION_REUSED", "Request ID was used for another action.");
        if (previous.response) return previous.response;
      }
      throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before commenting.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2034"].includes(error.code)) {
      throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before commenting.");
    }
    throw error;
  }
}
