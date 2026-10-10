import { PhotoEventAction, Prisma, ReviewCapability, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { photoCommentHash, matchesPhotoCommentContext, type PhotoComment } from "./photo_comment_contract";
import { assignedPhotoTrack } from "./photo_service";
import { ReviewRequestError } from "./review_error";

const commenters = [ReviewCapability.PHOTO_UPLOADER, ReviewCapability.PHOTO_QC, ReviewCapability.FINAL_MODERATOR];

export async function addPhotoComment(adminId: number, reviewId: number, input: PhotoComment) {
  const requestHash = photoCommentHash(reviewId, input);
  try {
    return await prisma.$transaction(async tx => {
      await assignedPhotoTrack(tx, adminId, reviewId, commenters);
      await tx.$queryRaw`SELECT id FROM "ReviewTrack" WHERE id = ${reviewId} FOR UPDATE`;
      const { track } = await assignedPhotoTrack(tx, adminId, reviewId, commenters);
      const previous = await tx.reviewOperation.findUnique({ where: {
        actor_id_client_key: { actor_id: adminId, client_key: input.operationId },
      }, select: { request_hash: true, response: true } });
      if (previous) {
        if (previous.request_hash !== requestHash) throw new ReviewRequestError(409, "OPERATION_REUSED", "Request ID was used for another action.");
        if (previous.response) return previous.response;
        throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "Refresh and try again.");
      }
      if (track.version !== input.expectedVersion) {
        throw new ReviewRequestError(409, "STALE_REVIEW", "The photo review changed. Refresh before commenting.");
      }
      const pair = await tx.photoPairRevision.findFirst({ where: { track_id: reviewId },
        orderBy: { track_version: "desc" }, select: { id: true } });
      if (!matchesPhotoCommentContext(track.stage, pair?.id ?? null, input.pairRevisionId)) {
        throw new ReviewRequestError(409, "STALE_PAIR", "The photo pair changed. Refresh before commenting.");
      }
      const operation = await tx.reviewOperation.create({ data: {
        actor_id: adminId, client_key: input.operationId, request_hash: requestHash,
      }, select: { id: true } });
      const changed = await tx.reviewTrack.updateMany({ where: {
        id: reviewId, type: ReviewTrackType.PHOTOS, stage: track.stage, version: track.version,
      }, data: { version: { increment: 1 } } });
      if (changed.count !== 1) throw new ReviewRequestError(409, "STALE_REVIEW", "The photo review changed. Refresh.");
      const version = track.version + 1;
      const event = await tx.photoReviewEvent.create({ data: {
        track_id: reviewId, track_version: version, pair_id: pair?.id ?? null, actor_id: adminId,
        operation_id: operation.id, action: PhotoEventAction.COMMENTED,
        from_stage: track.stage, to_stage: track.stage, note: input.note,
      }, select: { id: true } });
      const response = { success: true, eventId: event.id, reviewId, pairRevisionId: pair?.id ?? null,
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
      throw new ReviewRequestError(409, "STALE_REVIEW", "The photo review changed. Refresh before commenting.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025", "P2034"].includes(error.code)) {
      throw new ReviewRequestError(409, "STALE_REVIEW", "The photo review changed. Refresh before commenting.");
    }
    throw error;
  }
}
