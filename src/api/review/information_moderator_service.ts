import { InformationEventAction, Prisma, ReviewCapability, ReviewStage, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { profileHash } from "./information_draft_contract";
import { assignedTrack, snapshot, storedSnapshot } from "./information_draft_service";
import {
  moderatorRequestHash, moderatorTransition, publicationChanges, publishableProfile,
  type InformationModeratorRequest,
} from "./information_moderator_contract";
import { ReviewRequestError } from "./review_error";

export async function decideInformationModerator(adminId: number, reviewId: number, input: InformationModeratorRequest) {
  const requestHash = moderatorRequestHash(reviewId, input);
  try {
    return await prisma.$transaction(async tx => {
      await assignedTrack(tx, adminId, reviewId, [ReviewCapability.FINAL_MODERATOR]);
      const moderators = await tx.reviewAssignment.findMany({
        where: { capability: ReviewCapability.FINAL_MODERATOR, revoked_at: null },
        select: { admin_id: true }, distinct: ["admin_id"], take: 2,
      });
      if (moderators.length !== 1 || moderators[0]?.admin_id !== adminId) {
        throw new ReviewRequestError(409, "MODERATOR_CONFIGURATION", "One designated final moderator is required.");
      }
      const rows = await tx.$queryRaw<{ student_id: number }[]>`
        SELECT s.id AS student_id FROM "ReviewTrack" t
        JOIN "ReviewCase" c ON c.id = t.case_id
        JOIN "Student" s ON s.id = c.student_id
        WHERE t.id = ${reviewId} AND t.type = 'INFORMATION'
        FOR UPDATE OF s`;
      if (rows.length !== 1) throw new ReviewRequestError(404, "NOT_FOUND", "Information review not found.");
      const { track, student } = await assignedTrack(tx, adminId, reviewId, [ReviewCapability.FINAL_MODERATOR]);

      const previousOperation = await tx.reviewOperation.findUnique({
        where: { actor_id_client_key: { actor_id: adminId, client_key: input.operationId } },
        select: { request_hash: true, response: true },
      });
      if (previousOperation) {
        if (previousOperation.request_hash !== requestHash) {
          throw new ReviewRequestError(409, "OPERATION_REUSED", "This request ID was used for another action.");
        }
        if (!previousOperation.response) {
          throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "This decision did not complete. Refresh and try again.");
        }
        return previousOperation.response;
      }
      if (track.version !== input.expectedVersion) {
        throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before deciding.");
      }
      const transition = moderatorTransition(track.stage, input.decision);
      if (!transition) throw new ReviewRequestError(409, "STAGE_CHANGED", "This moderator action is no longer available.");

      const latest = await tx.reviewRevision.findFirst({
        where: { track_id: reviewId }, orderBy: { track_version: "desc" },
        select: { id: true, after_snapshot: true, canonical_hash: true },
      });
      const forwarded = await tx.informationReviewEvent.findFirst({
        where: { track_id: reviewId, action: InformationEventAction.SUBMITTED_MODERATOR },
        orderBy: { track_version: "desc" }, select: { revision_id: true },
      });
      const qcApproval = await tx.informationReviewEvent.findFirst({
        where: { track_id: reviewId, action: InformationEventAction.APPROVED_QC },
        orderBy: { track_version: "desc" }, select: { revision_id: true },
      });
      if (!latest || latest.id !== input.revisionId ||
          forwarded?.revision_id !== input.revisionId || qcApproval?.revision_id !== input.revisionId) {
        throw new ReviewRequestError(409, "STALE_REVISION", "The forwarded revision changed. Refresh before deciding.");
      }
      const canonical = snapshot(student);
      if (latest.canonical_hash !== profileHash(canonical)) {
        throw new ReviewRequestError(409, "SOURCE_CHANGED", "The live profile changed. Reconcile it before deciding.");
      }

      let changes: ReturnType<typeof publicationChanges> | null = null;
      let approved: ReturnType<typeof storedSnapshot> | null = null;
      if (input.decision === "APPROVE") {
        approved = storedSnapshot(latest.after_snapshot);
        if (!publishableProfile(approved)) {
          throw new ReviewRequestError(409, "INVALID_REVISION", "The saved revision has incomplete or invalid required profile data.");
        }
        if (canonical.department !== approved.department || canonical.program !== approved.program ||
            canonical.major !== approved.major) {
          const academic = await tx.student.findFirst({
            where: { department: approved.department, course: approved.program, major: approved.major },
            select: { id: true },
          });
          if (!academic) throw new ReviewRequestError(409, "INVALID_ACADEMIC", "The approved academic combination is no longer available.");
        }
        changes = publicationChanges(canonical, approved);
      }

      const operation = await tx.reviewOperation.create({
        data: { actor_id: adminId, client_key: input.operationId, request_hash: requestHash },
        select: { id: true },
      });
      const updated = await tx.reviewTrack.updateMany({
        where: { id: reviewId, type: ReviewTrackType.INFORMATION, version: track.version, stage: ReviewStage.SUBMITTED_MODERATOR },
        data: { stage: transition.toStage, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before deciding.");

      if (changes && approved) {
        if (Object.keys(changes.student).length > 0) {
          await tx.student.update({ where: { id: student.id }, data: changes.student });
        }
        if (student.studentDetail) {
          if (Object.keys(changes.detail).length > 0) {
            await tx.studentDetail.update({ where: { id: student.id }, data: changes.detail });
          }
        } else {
          await tx.studentDetail.create({ data: {
            id: student.id, birth_date: new Date(`${approved.birthDate}T00:00:00.000Z`),
            contact_num: approved.contactNumber, province: approved.province,
            city: approved.city, barangay: approved.barangay,
            mothers_name: approved.mothersName, mothers_title: approved.mothersTitle,
            fathers_name: approved.fathersName, fathers_title: approved.fathersTitle,
            guardians_name: approved.guardiansName, guardians_title: approved.guardiansTitle,
          } });
        }
      }

      const version = track.version + 1;
      await tx.informationReviewEvent.create({ data: {
        track_id: reviewId, track_version: version, revision_id: input.revisionId,
        actor_id: adminId, operation_id: operation.id, action: transition.action,
        from_stage: track.stage, to_stage: transition.toStage, note: input.reason,
      } });
      const response = { success: true, reviewId, revisionId: input.revisionId, version, stage: transition.toStage };
      await tx.reviewOperation.update({ where: { id: operation.id }, data: { response } });
      return response;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025", "P2034"].includes(error.code)) {
      throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before deciding.");
    }
    throw error;
  }
}
