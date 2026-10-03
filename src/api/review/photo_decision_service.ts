import { PhotoEventAction, Prisma, ReviewCapability, ReviewStage, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { photoDecisionHash, photoTransition, type PhotoDecisionRequest } from "./photo_decision_contract";
import { assignedPhotoTrack } from "./photo_service";
import { ReviewRequestError } from "./review_error";

export async function decidePhotoReview(adminId: number, reviewId: number,
  role: "qc" | "moderator", input: PhotoDecisionRequest) {
  const capability = role === "qc" ? ReviewCapability.PHOTO_QC : ReviewCapability.FINAL_MODERATOR;
  const requestHash = photoDecisionHash(reviewId, role, input);
  try {
    return await prisma.$transaction(async tx => {
      await assignedPhotoTrack(tx, adminId, reviewId, [capability]);
      await tx.$queryRaw`SELECT id FROM "ReviewTrack" WHERE id = ${reviewId} FOR UPDATE`;
      const { track } = await assignedPhotoTrack(tx, adminId, reviewId, [capability]);
      if (role === "moderator") {
        const moderators = await tx.reviewAssignment.findMany({
          where: { capability: ReviewCapability.FINAL_MODERATOR, revoked_at: null },
          select: { admin_id: true }, distinct: ["admin_id"], take: 2,
        });
        if (moderators.length !== 1 || moderators[0]?.admin_id !== adminId) {
          throw new ReviewRequestError(409, "MODERATOR_CONFIGURATION", "One designated final moderator is required.");
        }
      }
      const previous = await tx.reviewOperation.findUnique({ where: {
        actor_id_client_key: { actor_id: adminId, client_key: input.operationId },
      }, select: { request_hash: true, response: true } });
      if (previous) {
        if (previous.request_hash !== requestHash) {
          throw new ReviewRequestError(409, "OPERATION_REUSED", "Request ID was used for another action.");
        }
        if (previous.response) return previous.response;
        throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "Refresh and try again.");
      }
      if (track.version !== input.expectedVersion) {
        throw new ReviewRequestError(409, "STALE_REVIEW", "The photo review changed. Refresh before deciding.");
      }
      const transition = photoTransition(role, track.stage, input.decision);
      if (!transition) throw new ReviewRequestError(409, "STAGE_CHANGED", "This decision is no longer available.");
      const [pair, submitted, approved, forwarded] = await Promise.all([
        tx.photoPairRevision.findFirst({ where: { track_id: reviewId },
          orderBy: { track_version: "desc" }, select: { id: true } }),
        tx.photoReviewEvent.findFirst({ where: { track_id: reviewId, action: PhotoEventAction.SUBMITTED_QC },
          orderBy: { track_version: "desc" }, select: { pair_id: true } }),
        tx.photoReviewEvent.findFirst({ where: { track_id: reviewId, action: PhotoEventAction.APPROVED_QC },
          orderBy: { track_version: "desc" }, select: { pair_id: true } }),
        tx.photoReviewEvent.findFirst({ where: { track_id: reviewId, action: PhotoEventAction.SUBMITTED_MODERATOR },
          orderBy: { track_version: "desc" }, select: { pair_id: true } }),
      ]);
      if (!pair || pair.id !== input.pairRevisionId || submitted?.pair_id !== pair.id ||
          (track.stage === ReviewStage.APPROVED_QC && approved?.pair_id !== pair.id) ||
          (track.stage === ReviewStage.SUBMITTED_MODERATOR &&
            (approved?.pair_id !== pair.id || forwarded?.pair_id !== pair.id))) {
        throw new ReviewRequestError(409, "STALE_PAIR", "The submitted photo pair changed. Refresh before deciding.");
      }
      const operation = await tx.reviewOperation.create({ data: {
        actor_id: adminId, client_key: input.operationId, request_hash: requestHash,
      }, select: { id: true } });
      const changed = await tx.reviewTrack.updateMany({ where: {
        id: reviewId, type: ReviewTrackType.PHOTOS, stage: track.stage, version: track.version,
      }, data: { stage: transition.toStage, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ReviewRequestError(409, "STALE_REVIEW", "The photo review changed. Refresh.");
      const version = track.version + 1;
      await tx.photoReviewEvent.create({ data: {
        track_id: reviewId, track_version: version, pair_id: pair.id, actor_id: adminId,
        operation_id: operation.id, action: transition.action, from_stage: track.stage,
        to_stage: transition.toStage, note: input.reason,
      } });
      const response = { success: true, reviewId, pairRevisionId: pair.id, version, stage: transition.toStage };
      await tx.reviewOperation.update({ where: { id: operation.id }, data: { response } });
      return response;
    }, { maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const previous = await prisma.reviewOperation.findUnique({ where: {
        actor_id_client_key: { actor_id: adminId, client_key: input.operationId },
      }, select: { request_hash: true, response: true } });
      if (previous) {
        if (previous.request_hash !== requestHash) {
          throw new ReviewRequestError(409, "OPERATION_REUSED", "Request ID was used for another action.");
        }
        if (previous.response) return previous.response;
      }
      throw new ReviewRequestError(409, "STALE_REVIEW", "The photo review changed. Refresh before deciding.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025", "P2034"].includes(error.code)) {
      throw new ReviewRequestError(409, "STALE_REVIEW", "The photo review changed. Refresh before deciding.");
    }
    throw error;
  }
}

export async function photoDecisionHistory(adminId: number, reviewId: number) {
  await assignedPhotoTrack(prisma, adminId, reviewId, [
    ReviewCapability.PHOTO_UPLOADER, ReviewCapability.PHOTO_QC, ReviewCapability.FINAL_MODERATOR,
    ReviewCapability.IT_CORRECTION,
  ]);
  const events = await prisma.photoReviewEvent.findMany({
    where: { track_id: reviewId }, orderBy: { track_version: "desc" }, take: 30,
    select: { id: true, track_version: true, pair_id: true, action: true,
      from_stage: true, to_stage: true, note: true, created_at: true,
      actor: { select: { first_name: true, last_name: true } } },
  });
  return { success: true, events };
}
