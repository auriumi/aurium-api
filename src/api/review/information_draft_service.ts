import { AdminRoles, Prisma, RacOutcome, ReviewCapability, ReviewStage, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { matchesGraduateScope } from "./review_scope";
import { ReviewRequestError } from "./review_error";
import {
  applyDraftChanges, draftRequestHash, editableProfileFields, profileHash,
  type DraftSave, type EditableProfile,
} from "./information_draft_contract";

const editableStages: ReviewStage[] = [ReviewStage.DRAFT, ReviewStage.REJECTED_QC, ReviewStage.REJECTED_MODERATOR];

const profileSelect = {
  id: true, first_name: true, mid_name: true, last_name: true, suffix: true,
  nickname: true, department: true, course: true, major: true, thesis_title: true,
  grad_year: true, grad_term: true,
  studentDetail: { select: {
    birth_date: true, contact_num: true, province: true, city: true, barangay: true,
    mothers_name: true, mothers_title: true, fathers_name: true, fathers_title: true,
    guardians_name: true, guardians_title: true,
  } },
} satisfies Prisma.StudentSelect;

type ProfileStudent = Prisma.StudentGetPayload<{ select: typeof profileSelect }>;

function snapshot(student: ProfileStudent): EditableProfile {
  const detail = student.studentDetail;
  return {
    firstName: student.first_name, middleName: student.mid_name, lastName: student.last_name,
    suffix: student.suffix, nickname: student.nickname,
    birthDate: detail?.birth_date.toISOString().slice(0, 10) ?? null,
    department: student.department, program: student.course, major: student.major,
    thesisTitle: student.thesis_title, contactNumber: detail?.contact_num ?? null,
    province: detail?.province ?? null, city: detail?.city ?? null, barangay: detail?.barangay ?? null,
    mothersName: detail?.mothers_name ?? null, mothersTitle: detail?.mothers_title ?? null,
    fathersName: detail?.fathers_name ?? null, fathersTitle: detail?.fathers_title ?? null,
    guardiansName: detail?.guardians_name ?? null, guardiansTitle: detail?.guardians_title ?? null,
  };
}

export function storedSnapshot(value: Prisma.JsonValue): EditableProfile {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      editableProfileFields.some(field => !(field in value) ||
        (value[field] !== null && typeof value[field] !== "string"))) {
    throw new Error("Invalid information revision snapshot.");
  }
  return Object.fromEntries(editableProfileFields.map(field => [field, value[field]])) as EditableProfile;
}

async function assignedTrack(
  client: Prisma.TransactionClient | typeof prisma, adminId: number, reviewId: number,
  capabilities: readonly ReviewCapability[],
) {
  const admin = await client.admin.findUnique({ where: { id: adminId }, select: { role: true } });
  if (!admin || !Object.values(AdminRoles).includes(admin.role)) {
    throw new ReviewRequestError(403, "FORBIDDEN", "Staff account unavailable.");
  }
  const assignments = await client.reviewAssignment.findMany({
    where: { admin_id: adminId, capability: { in: [...capabilities] }, revoked_at: null },
    select: { department: true, course: true, major: true },
  });
  if (assignments.length === 0) {
    throw new ReviewRequestError(403, "FORBIDDEN", "Information review assignment required.");
  }
  const track = await client.reviewTrack.findUnique({
    where: { id: reviewId },
    select: { id: true, type: true, stage: true, version: true,
      reviewCase: { select: { outcome: true, grad_year: true, grad_term: true,
        student: { select: profileSelect } } },
    },
  });
  const reviewCase = track?.reviewCase;
  const student = reviewCase?.student;
  if (!track || track.type !== ReviewTrackType.INFORMATION ||
      !reviewCase || reviewCase.outcome !== RacOutcome.VERIFIED || !student ||
      student.grad_year !== reviewCase.grad_year || student.grad_term !== reviewCase.grad_term ||
      !assignments.some(scope => matchesGraduateScope(scope, student))) {
    throw new ReviewRequestError(404, "NOT_FOUND", "Information review not found.");
  }
  return { track, student };
}

export async function saveInformationDraft(adminId: number, reviewId: number, draft: DraftSave) {
  const requestHash = draftRequestHash(reviewId, draft);
  try {
    return await prisma.$transaction(async tx => {
      await assignedTrack(tx, adminId, reviewId, [ReviewCapability.INFORMATION_PROOFREADER]);
      // Share the graduate row lock with the legacy profile editor so a draft
      // cannot race a direct canonical update. Publication must use it too.
      const rows = await tx.$queryRaw<{ student_id: number }[]>`
        SELECT s.id AS student_id FROM "ReviewTrack" t
        JOIN "ReviewCase" c ON c.id = t.case_id
        JOIN "Student" s ON s.id = c.student_id
        WHERE t.id = ${reviewId} AND t.type = 'INFORMATION'
        FOR UPDATE OF s`;
      if (rows.length !== 1) throw new ReviewRequestError(404, "NOT_FOUND", "Information review not found.");
      const { track, student } = await assignedTrack(tx, adminId, reviewId, [ReviewCapability.INFORMATION_PROOFREADER]);

      const previousOperation = await tx.reviewOperation.findUnique({
        where: { actor_id_client_key: { actor_id: adminId, client_key: draft.operationId } },
        select: { request_hash: true, response: true },
      });
      if (previousOperation) {
        if (previousOperation.request_hash !== requestHash) {
          throw new ReviewRequestError(409, "OPERATION_REUSED", "This request ID was used for another change.");
        }
        if (!previousOperation.response) {
          throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "This save did not complete. Refresh and try again.");
        }
        return previousOperation.response;
      }

      if (!editableStages.includes(track.stage)) {
        throw new ReviewRequestError(409, "STAGE_CHANGED", "This review is no longer editable.");
      }
      if (track.version !== draft.expectedVersion) {
        throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before saving.");
      }

      const canonical = snapshot(student);
      const canonicalHash = profileHash(canonical);
      const latest = await tx.reviewRevision.findFirst({
        where: { track_id: reviewId }, orderBy: { track_version: "desc" },
        select: { after_snapshot: true, canonical_hash: true },
      });
      if (latest && latest.canonical_hash !== canonicalHash) {
        throw new ReviewRequestError(409, "SOURCE_CHANGED", "The live profile changed. A moderator must reconcile it before more edits.");
      }
      const before = latest ? storedSnapshot(latest.after_snapshot) : canonical;
      const { after, changedFields } = applyDraftChanges(before, draft.changes);
      if (changedFields.some(field => ["department", "program", "major"].includes(field))) {
        if (!after.department || !after.program ||
            !await tx.student.findFirst({
              where: { department: after.department, course: after.program, major: after.major },
              select: { id: true },
            })) {
          throw new ReviewRequestError(400, "INVALID_ACADEMIC", "Choose a department, program and major combination from the graduate records.");
        }
      }

      const operation = await tx.reviewOperation.create({
        data: { actor_id: adminId, client_key: draft.operationId, request_hash: requestHash },
        select: { id: true },
      });
      let revisionId: number | null = null;
      let version = track.version;
      if (changedFields.length > 0) {
        const update = await tx.reviewTrack.updateMany({
          where: { id: reviewId, type: ReviewTrackType.INFORMATION, version: track.version, stage: { in: editableStages } },
          data: { version: { increment: 1 } },
        });
        if (update.count !== 1) throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before saving.");
        version += 1;
        const revision = await tx.reviewRevision.create({
          data: {
            track_id: reviewId, track_version: version,
            before_snapshot: before as Prisma.InputJsonObject,
            after_snapshot: after as Prisma.InputJsonObject,
            canonical_hash: canonicalHash, created_by: adminId, operation_id: operation.id,
          },
          select: { id: true },
        });
        revisionId = revision.id;
      }
      const response = { success: true, changed: changedFields.length > 0, reviewId, version, revisionId, changedFields };
      await tx.reviewOperation.update({ where: { id: operation.id }, data: { response } });
      return response;
    }, { maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const previous = await prisma.reviewOperation.findUnique({
        where: { actor_id_client_key: { actor_id: adminId, client_key: draft.operationId } },
        select: { request_hash: true, response: true },
      });
      if (previous) {
        if (previous.request_hash !== requestHash) throw new ReviewRequestError(409, "OPERATION_REUSED", "This request ID was used for another change.");
        if (previous.response) return previous.response;
      }
      throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before saving.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2034"].includes(error.code)) {
      throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before saving.");
    }
    throw error;
  }
}

export async function informationDraftHistory(adminId: number, reviewId: number) {
  await assignedTrack(prisma, adminId, reviewId, [
    ReviewCapability.INFORMATION_PROOFREADER, ReviewCapability.INFORMATION_QC, ReviewCapability.FINAL_MODERATOR,
  ]);
  const rows = await prisma.reviewRevision.findMany({
    where: { track_id: reviewId }, orderBy: { track_version: "desc" }, take: 20,
    select: { id: true, track_version: true, before_snapshot: true, after_snapshot: true, created_at: true,
      author: { select: { first_name: true, last_name: true } } },
  });
  return {
    success: true,
    revisions: rows.map(row => {
      const before = storedSnapshot(row.before_snapshot);
      const after = storedSnapshot(row.after_snapshot);
      return {
        id: row.id, version: row.track_version, before, after,
        changedFields: editableProfileFields.filter(field => before[field] !== after[field]),
        createdAt: row.created_at, author: row.author,
      };
    }),
  };
}
