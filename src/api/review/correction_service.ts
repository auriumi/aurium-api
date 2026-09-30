import { CorrectionStatus, InformationEventAction, PhotoEventAction, Prisma,
  RacOutcome, ReviewCapability, ReviewStage, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { correctionHash, type CorrectionDecisionInput, type CorrectionRequestInput } from "./correction_contract";
import { profileHash } from "./information_draft_contract";
import { profileSelect, snapshot, storedSnapshot } from "./information_draft_service";
import { graduateScopeWhere } from "./review_filters";
import { matchesGraduateScope } from "./review_scope";
import { ReviewRequestError } from "./review_error";

type Client = Prisma.TransactionClient | typeof prisma;
const reviewerCapabilities = [ReviewCapability.INFORMATION_PROOFREADER, ReviewCapability.INFORMATION_QC,
  ReviewCapability.PHOTO_UPLOADER, ReviewCapability.PHOTO_QC, ReviewCapability.FINAL_MODERATOR];

async function authorizedTrack(client: Client, adminId: number, trackId: number, itOnly = false) {
  const [admin, track] = await Promise.all([
    client.admin.findUnique({ where: { id: adminId }, select: { id: true } }),
    client.reviewTrack.findUnique({ where: { id: trackId }, select: {
      id: true, type: true, stage: true, version: true,
      reviewCase: { select: { outcome: true, grad_year: true, grad_term: true,
        student: { select: { id: true, student_number: true, grad_year: true, grad_term: true,
          department: true, course: true, major: true, first_name: true, last_name: true } } } },
    } }),
  ]);
  if (!admin) throw new ReviewRequestError(403, "FORBIDDEN", "Staff account unavailable.");
  const capabilities = itOnly ? [ReviewCapability.IT_CORRECTION] :
    track?.type === ReviewTrackType.INFORMATION ? reviewerCapabilities.filter(item =>
      item === ReviewCapability.INFORMATION_PROOFREADER || item === ReviewCapability.INFORMATION_QC ||
      item === ReviewCapability.FINAL_MODERATOR) : reviewerCapabilities.filter(item =>
      item === ReviewCapability.PHOTO_UPLOADER || item === ReviewCapability.PHOTO_QC ||
      item === ReviewCapability.FINAL_MODERATOR);
  const assignments = await client.reviewAssignment.findMany({
    where: { admin_id: adminId, capability: { in: capabilities }, revoked_at: null },
    select: { department: true, course: true, major: true },
  });
  const reviewCase = track?.reviewCase;
  const student = reviewCase?.student;
  if (!track || !reviewCase || !student || reviewCase.outcome !== RacOutcome.VERIFIED ||
      reviewCase.grad_year !== student.grad_year || reviewCase.grad_term !== student.grad_term ||
      !assignments.some(item => matchesGraduateScope(item, student))) {
    throw new ReviewRequestError(404, "NOT_FOUND", "Review not found.");
  }
  return { track, student };
}

async function lockTrack(client: Prisma.TransactionClient, trackId: number, type: ReviewTrackType) {
  if (type === ReviewTrackType.INFORMATION) {
    // Match the lock order used by information draft and moderator publication.
    const students = await client.$queryRaw<{ id: number }[]>`
      SELECT s.id FROM "ReviewTrack" t JOIN "ReviewCase" c ON c.id = t.case_id
      JOIN "Student" s ON s.id = c.student_id WHERE t.id = ${trackId} FOR UPDATE OF s`;
    if (students.length !== 1) throw new ReviewRequestError(404, "NOT_FOUND", "Review not found.");
  }
  await client.$queryRaw`SELECT id FROM "ReviewTrack" WHERE id = ${trackId} FOR UPDATE`;
}

async function replay(client: Prisma.TransactionClient, adminId: number, key: string, hash: string) {
  const previous = await client.reviewOperation.findUnique({
    where: { actor_id_client_key: { actor_id: adminId, client_key: key } },
    select: { request_hash: true, response: true },
  });
  if (!previous) return null;
  if (previous.request_hash !== hash) throw new ReviewRequestError(409, "OPERATION_REUSED", "Request ID was used for another action.");
  if (!previous.response) throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "Refresh before retrying.");
  return previous.response;
}

function correctionConflict(error: unknown, adminId: number, key: string, hash: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return prisma.reviewOperation.findUnique({
      where: { actor_id_client_key: { actor_id: adminId, client_key: key } },
      select: { request_hash: true, response: true },
    }).then(previous => {
      if (previous && previous.request_hash !== hash) throw new ReviewRequestError(409, "OPERATION_REUSED", "Request ID was used for another action.");
      if (previous?.response) return previous.response;
      throw new ReviewRequestError(409, "CORRECTION_PENDING", "A correction request already exists. Refresh.");
    });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025", "P2034"].includes(error.code)) {
    throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before trying again.");
  }
  throw error;
}

export async function requestCorrection(adminId: number, trackId: number, input: CorrectionRequestInput) {
  const hash = correctionHash(["REQUEST", trackId, input.expectedVersion, input.reason]);
  try {
    return await prisma.$transaction(async tx => {
      const initial = await authorizedTrack(tx, adminId, trackId);
      await lockTrack(tx, trackId, initial.track.type);
      const { track } = await authorizedTrack(tx, adminId, trackId);
      const previous = await replay(tx, adminId, input.operationId, hash);
      if (previous) return previous;
      if (track.stage !== ReviewStage.LOCKED || track.version !== input.expectedVersion) {
        throw new ReviewRequestError(409, "STALE_REVIEW", "The approved review changed. Refresh before requesting a correction.");
      }
      const pending = await tx.correctionRequest.findFirst({ where: { track_id: trackId, status: CorrectionStatus.PENDING },
        select: { id: true } });
      if (pending) throw new ReviewRequestError(409, "CORRECTION_PENDING", "A correction request is already pending.");
      const locked = track.type === ReviewTrackType.INFORMATION
        ? await tx.informationReviewEvent.findFirst({ where: { track_id: trackId, action: InformationEventAction.LOCKED },
          orderBy: { track_version: "desc" }, select: { revision_id: true, track_version: true } })
        : await tx.photoReviewEvent.findFirst({ where: { track_id: trackId, action: PhotoEventAction.LOCKED },
          orderBy: { track_version: "desc" }, select: { pair_id: true, track_version: true } });
      if (!locked || locked.track_version !== track.version) {
        throw new ReviewRequestError(409, "LOCK_MISSING", "The current approved revision could not be confirmed.");
      }
      const operation = await tx.reviewOperation.create({ data: {
        actor_id: adminId, client_key: input.operationId, request_hash: hash,
      }, select: { id: true } });
      const correction = await tx.correctionRequest.create({ data: {
        track_id: trackId, locked_version: track.version, requested_by: adminId,
        request_operation_id: operation.id, reason: input.reason,
        ...(track.type === ReviewTrackType.INFORMATION
          ? { information_revision_id: "revision_id" in locked ? locked.revision_id : null }
          : { photo_pair_id: "pair_id" in locked ? locked.pair_id : null }),
      }, select: { id: true, status: true } });
      const response = { success: true, correctionId: correction.id, status: correction.status,
        reviewId: trackId, version: track.version };
      await tx.reviewOperation.update({ where: { id: operation.id }, data: { response } });
      return response;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
  } catch (error) { return correctionConflict(error, adminId, input.operationId, hash); }
}

export async function decideCorrection(adminId: number, correctionId: number, input: CorrectionDecisionInput) {
  const hash = correctionHash(["DECIDE", correctionId, input.expectedVersion, input.decision, input.reason]);
  try {
    return await prisma.$transaction(async tx => {
      const initial = await tx.correctionRequest.findUnique({ where: { id: correctionId },
        select: { track_id: true, track: { select: { type: true } } } });
      if (!initial) throw new ReviewRequestError(404, "NOT_FOUND", "Correction request not found.");
      await authorizedTrack(tx, adminId, initial.track_id, true);
      await lockTrack(tx, initial.track_id, initial.track.type);
      const { track, student } = await authorizedTrack(tx, adminId, initial.track_id, true);
      const previous = await replay(tx, adminId, input.operationId, hash);
      if (previous) return previous;
      const correction = await tx.correctionRequest.findUnique({ where: { id: correctionId } });
      if (!correction || correction.status !== CorrectionStatus.PENDING || track.stage !== ReviewStage.LOCKED ||
          track.version !== input.expectedVersion || correction.locked_version !== track.version) {
        throw new ReviewRequestError(409, "STALE_CORRECTION", "This request or approved review changed. Refresh.");
      }
      if (correction.requested_by === adminId) {
        throw new ReviewRequestError(403, "SELF_APPROVAL", "A different IT reviewer must decide this request.");
      }
      const operation = await tx.reviewOperation.create({ data: {
        actor_id: adminId, client_key: input.operationId, request_hash: hash,
      }, select: { id: true } });
      let reopenedVersion: number | null = null;
      if (input.decision === "APPROVE") {
        const changed = await tx.reviewTrack.updateMany({ where: {
          id: track.id, version: track.version, stage: ReviewStage.LOCKED,
        }, data: { stage: ReviewStage.DRAFT, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh.");
        reopenedVersion = track.version + 1;
        if (track.type === ReviewTrackType.INFORMATION) {
          if (!correction.information_revision_id) throw new ReviewRequestError(409, "REVISION_MISSING", "Locked information revision is missing.");
          const [lockedRevision, current] = await Promise.all([
            tx.reviewRevision.findUnique({ where: { id: correction.information_revision_id }, select: {
              after_snapshot: true, canonical_hash: true,
            } }),
            tx.student.findUnique({ where: { id: student.id }, select: profileSelect }),
          ]);
          if (!lockedRevision || !current || lockedRevision.canonical_hash !== profileHash(snapshot(current)) ||
              profileHash(storedSnapshot(lockedRevision.after_snapshot)) !== profileHash(snapshot(current))) {
            throw new ReviewRequestError(409, "SOURCE_CHANGED", "The live profile no longer matches the approved revision.");
          }
          const baseline = snapshot(current);
          const revision = await tx.reviewRevision.create({ data: {
            track_id: track.id, track_version: reopenedVersion,
            before_snapshot: baseline as Prisma.InputJsonObject,
            after_snapshot: baseline as Prisma.InputJsonObject,
            canonical_hash: profileHash(baseline), created_by: adminId, operation_id: operation.id,
          }, select: { id: true } });
          await tx.informationReviewEvent.create({ data: {
            track_id: track.id, track_version: reopenedVersion, revision_id: revision.id,
            actor_id: adminId, operation_id: operation.id, action: InformationEventAction.REOPENED,
            from_stage: ReviewStage.LOCKED, to_stage: ReviewStage.DRAFT,
          } });
        } else {
          if (!correction.photo_pair_id) throw new ReviewRequestError(409, "PAIR_MISSING", "Locked photo pair is missing.");
          const lockedPair = await tx.photoPairRevision.findUnique({ where: { id: correction.photo_pair_id },
            select: { graduation_asset_id: true, theme_asset_id: true } });
          if (!lockedPair) throw new ReviewRequestError(409, "PAIR_MISSING", "Locked photo pair is missing.");
          const pair = await tx.photoPairRevision.create({ data: {
            track_id: track.id, track_version: reopenedVersion,
            graduation_asset_id: lockedPair.graduation_asset_id,
            theme_asset_id: lockedPair.theme_asset_id, created_by: adminId,
          }, select: { id: true } });
          await tx.photoReviewEvent.create({ data: {
            track_id: track.id, track_version: reopenedVersion, pair_id: pair.id,
            actor_id: adminId, operation_id: operation.id, action: PhotoEventAction.REOPENED,
            from_stage: ReviewStage.LOCKED, to_stage: ReviewStage.DRAFT,
          } });
        }
      }
      await tx.correctionRequest.update({ where: { id: correctionId }, data: {
        status: input.decision === "APPROVE" ? CorrectionStatus.APPROVED : CorrectionStatus.REJECTED,
        decided_by: adminId, decision_operation_id: operation.id, decision_note: input.reason,
        decided_at: new Date(), reopened_version: reopenedVersion,
      } });
      const response = { success: true, correctionId, status: input.decision === "APPROVE" ?
        CorrectionStatus.APPROVED : CorrectionStatus.REJECTED, reviewId: track.id,
        version: reopenedVersion ?? track.version };
      await tx.reviewOperation.update({ where: { id: operation.id }, data: { response } });
      return response;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
  } catch (error) { return correctionConflict(error, adminId, input.operationId, hash); }
}

export async function listCorrections(adminId: number, page: number, status: CorrectionStatus | "ALL") {
  const assignments = await prisma.reviewAssignment.findMany({ where: {
    admin_id: adminId, capability: ReviewCapability.IT_CORRECTION, revoked_at: null,
  }, select: { department: true, course: true, major: true } });
  if (!assignments.length) throw new ReviewRequestError(403, "FORBIDDEN", "IT correction assignment required.");
  const where: Prisma.CorrectionRequestWhereInput = {
    ...(status === "ALL" ? {} : { status }),
    track: { reviewCase: { student: graduateScopeWhere(assignments) } },
  };
  const [rows, total] = await Promise.all([
    prisma.correctionRequest.findMany({ where, skip: (page - 1) * 25, take: 25,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { id: true, track_id: true, locked_version: true, reason: true, status: true,
        created_at: true, decided_at: true, decision_note: true, requested_by: true,
        requester: { select: { first_name: true, last_name: true } },
        track: { select: { type: true, stage: true, version: true, reviewCase: { select: {
          grad_year: true, grad_term: true, student: { select: {
            student_number: true, first_name: true, last_name: true, department: true, course: true,
          } },
        } } } },
      },
    }),
    prisma.correctionRequest.count({ where }),
  ]);
  return { success: true, rows: rows.map(row => ({
    id: row.id, reviewId: row.track_id, trackType: row.track.type,
    lockedVersion: row.locked_version, currentVersion: row.track.version,
    stage: row.track.stage, reason: row.reason, status: row.status,
    createdAt: row.created_at, decidedAt: row.decided_at, decisionNote: row.decision_note,
    requestedBy: row.requester, requestedByCurrentUser: row.requested_by === adminId,
    graduate: { studentNumber: row.track.reviewCase.student.student_number,
      firstName: row.track.reviewCase.student.first_name,
      lastName: row.track.reviewCase.student.last_name,
      department: row.track.reviewCase.student.department,
      program: row.track.reviewCase.student.course,
      graduationYear: row.track.reviewCase.grad_year, graduationTerm: row.track.reviewCase.grad_term },
  })), page, pageSize: 25, total };
}
