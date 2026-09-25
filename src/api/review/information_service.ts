import { AdminRoles, InformationEventAction, Prisma, RacOutcome, ReviewCapability, ReviewStage, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { generateReadUrl } from "../student/r2_service";
import { ReviewRequestError } from "./review_error";
import { graduateScopeWhere, graduateSearchWhere } from "./review_filters";
import { matchesGraduateScope, type ReviewScope } from "./review_scope";
import { queueForStage, stagesForQueue, type InformationListQuery } from "./information_contract";
import type { Cycle } from "./rac_contract";
import { editableProfileFields } from "./information_draft_contract";
import { storedSnapshot } from "./information_draft_service";
import { canSubmitInformation } from "./information_submission_contract";

const informationCapabilities = [
  ReviewCapability.INFORMATION_PROOFREADER,
  ReviewCapability.INFORMATION_QC,
  ReviewCapability.FINAL_MODERATOR,
];

async function informationScopes(adminId: number) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { role: true } });
  if (!admin || !Object.values(AdminRoles).includes(admin.role)) {
    throw new ReviewRequestError(403, "FORBIDDEN", "Staff account unavailable.");
  }
  const assignments = await prisma.reviewAssignment.findMany({
    where: { admin_id: adminId, capability: { in: informationCapabilities }, revoked_at: null },
    select: { capability: true, department: true, course: true, major: true },
  });
  if (assignments.length === 0) {
    throw new ReviewRequestError(403, "FORBIDDEN", "Information review assignment required.");
  }
  return assignments;
}

function baseStudentWhere(scopes: readonly ReviewScope[], cycle: Cycle, filters: {
  department?: string | null; course?: string | null; major?: string | null; search?: string;
} = {}): Prisma.StudentWhereInput {
  return {
    AND: [
      { grad_year: cycle.year, grad_term: cycle.term },
      graduateScopeWhere(scopes),
      ...(filters.department ? [{ department: filters.department }] : []),
      ...(filters.course ? [{ course: filters.course }] : []),
      ...(filters.major === "__no_major__" ? [{ major: null }] : filters.major ? [{ major: filters.major }] : []),
      graduateSearchWhere(filters.search ?? ""),
    ],
  };
}

export async function listInformationReviews(adminId: number, query: InformationListQuery) {
  const scopes = await informationScopes(adminId);
  const base = baseStudentWhere(scopes, query, query);
  const cycleCase = { grad_year: query.year, grad_term: query.term };
  const stages = query.queue === "ALL" ? null : stagesForQueue(query.queue);
  const where: Prisma.StudentWhereInput = stages ? {
    AND: [base, { reviewCases: { some: {
      ...cycleCase, outcome: RacOutcome.VERIFIED,
      tracks: { some: { type: ReviewTrackType.INFORMATION, stage: { in: stages } } },
    } } }],
  } : base;

  const [students, all, stageCounts] = await Promise.all([
    prisma.student.findMany({
      where, skip: (query.page - 1) * 25, take: 25,
      orderBy: [{ first_name: "asc" }, { last_name: "asc" }, { student_number: "asc" }],
      select: {
        student_number: true, first_name: true, mid_name: true, last_name: true, suffix: true,
        department: true, course: true, major: true,
        reviewCases: {
          where: cycleCase,
          select: { outcome: true, tracks: {
            where: { type: ReviewTrackType.INFORMATION }, select: { id: true, stage: true, version: true },
          } },
        },
      },
    }),
    prisma.student.count({ where: base }),
    prisma.reviewTrack.groupBy({
      by: ["stage"],
      where: { type: ReviewTrackType.INFORMATION, reviewCase: {
        is: { ...cycleCase, outcome: RacOutcome.VERIFIED, student: { is: base } },
      } },
      _count: { _all: true },
    }),
  ]);

  const counts = {
    ALL: all, PENDING: 0, SUBMITTED_QC: 0, REJECTED_QC: 0,
    APPROVED_QC: 0, COMPLETED: 0, REJECTED_MODERATOR: 0,
  };
  for (const entry of stageCounts) counts[queueForStage(entry.stage)] += entry._count._all;

  return {
    success: true,
    rows: students.map(student => {
      const reviewCase = student.reviewCases[0];
      const track = reviewCase?.outcome === RacOutcome.VERIFIED ? reviewCase.tracks[0] : null;
      return {
        studentNumber: student.student_number,
        firstName: student.first_name, middleName: student.mid_name,
        lastName: student.last_name, suffix: student.suffix,
        department: student.department, program: student.course, major: student.major,
        verification: reviewCase?.outcome ?? "UNCHECKED",
        reviewId: track?.id ?? null,
        informationStage: track?.stage ?? null,
        version: track?.version ?? null,
      };
    }),
    page: query.page, pageSize: 25, total: counts[query.queue], counts,
  };
}

export async function informationFilterOptions(adminId: number, cycle: Cycle, department: string | null, course: string | null) {
  const scopes = await informationScopes(adminId);
  const base = baseStudentWhere(scopes, cycle);
  const [departments, courses, majors] = await Promise.all([
    prisma.student.findMany({ where: base, distinct: ["department"], select: { department: true } }),
    prisma.student.findMany({ where: { AND: [base, ...(department ? [{ department }] : [])] }, distinct: ["course"], select: { course: true } }),
    prisma.student.findMany({ where: { AND: [base, ...(department ? [{ department }] : []), ...(course ? [{ course }] : [])] }, distinct: ["major"], select: { major: true } }),
  ]);
  const names = (items: readonly (string | null)[]) => [...new Set(items.filter((item): item is string => !!item))].sort((a, b) => a.localeCompare(b));
  return {
    success: true,
    departments: names(departments.map(item => item.department)),
    programs: names(courses.map(item => item.course)),
    majors: names(majors.map(item => item.major)),
    hasNoMajor: majors.some(item => item.major === null),
  };
}

export async function informationReviewDetail(adminId: number, reviewId: number) {
  const scopes = await informationScopes(adminId);
  const track = await prisma.reviewTrack.findFirst({
    where: { id: reviewId, type: ReviewTrackType.INFORMATION, reviewCase: {
      is: { outcome: RacOutcome.VERIFIED, student: { is: graduateScopeWhere(scopes) } },
    } },
    select: {
      id: true, stage: true, version: true,
      revisions: { orderBy: { track_version: "desc" }, take: 1,
        select: { id: true, track_version: true, before_snapshot: true, after_snapshot: true, created_at: true } },
      informationEvents: { where: { action: { in: [
        InformationEventAction.REJECTED_QC, InformationEventAction.REJECTED_MODERATOR,
      ] } }, orderBy: { track_version: "desc" }, take: 1, select: { track_version: true } },
      reviewCase: { select: {
        grad_year: true, grad_term: true, outcome: true, checked_at: true, source_version: true,
        student: { select: {
          student_number: true, first_name: true, mid_name: true, last_name: true,
          suffix: true, nickname: true, school_email: true, personal_email: true,
          department: true, course: true, major: true, thesis_title: true,
          grad_year: true, grad_term: true, created_at: true, updated_at: true,
          studentDetail: { select: {
            birth_date: true, province: true, city: true, barangay: true,
            mothers_name: true, mothers_title: true, fathers_name: true, fathers_title: true,
            guardians_name: true, guardians_title: true, contact_num: true, photo_url: true,
          } },
          studentSolicitations: {
            orderBy: { slot: "asc" }, select: { slot: true, type: true, title: true, name: true },
          },
          studentAuth: { select: { status: true } },
          booking: {
            orderBy: { created_at: "desc" }, take: 1,
            select: { period: true, booking_day: { select: { date: true } },
              booking_slot: { select: { start_time: true, end_time: true } } },
          },
          attendanceQueue: { select: { id: true } },
        } },
      } },
    },
  });
  const reviewCase = track?.reviewCase;
  const student = reviewCase?.student;
  if (!track || !reviewCase || !student ||
      student.grad_year !== reviewCase.grad_year || student.grad_term !== reviewCase.grad_term ||
      !scopes.some(scope => matchesGraduateScope(scope, student))) {
    throw new ReviewRequestError(404, "NOT_FOUND", "Information review not found.");
  }

  // Never expose the storage key or unsigned object URL to the browser.
  let referencePhotoUrl: string | null = null;
  if (student.studentDetail?.photo_url) {
    try {
      referencePhotoUrl = await generateReadUrl(student.studentDetail.photo_url);
    } catch {
      // The profile remains available if object storage cannot sign this photo.
      console.error("Unable to sign information reference photo for review", reviewId);
    }
  }
  const booking = student.booking[0];
  const currentRevision = track.revisions[0];
  const before = currentRevision ? storedSnapshot(currentRevision.before_snapshot) : null;
  const after = currentRevision ? storedSnapshot(currentRevision.after_snapshot) : null;
  const editableStages: ReviewStage[] = [ReviewStage.DRAFT, ReviewStage.REJECTED_QC, ReviewStage.REJECTED_MODERATOR];
  const canEdit = editableStages.includes(track.stage) &&
    scopes.some(scope => scope.capability === ReviewCapability.INFORMATION_PROOFREADER &&
      matchesGraduateScope(scope, student));
  const canSubmit = canEdit && !!currentRevision && canSubmitInformation(
    track.stage, currentRevision.track_version, track.informationEvents[0]?.track_version ?? null,
  );
  return {
    success: true, reviewId: track.id, informationStage: track.stage,
    queue: queueForStage(track.stage), version: track.version,
    availableActions: canEdit ? ["SAVE_DRAFT", ...(canSubmit ? ["SUBMIT_QC"] : [])] : [] as string[],
    draft: currentRevision && before && after ? {
      revisionId: currentRevision.id, version: currentRevision.track_version,
      before, after,
      changedFields: editableProfileFields.filter(field => before[field] !== after[field]),
      savedAt: currentRevision.created_at,
    } : null,
    verification: {
      outcome: reviewCase.outcome, checkedAt: reviewCase.checked_at,
      sourceVersion: reviewCase.source_version,
    },
    profile: {
      studentNumber: student.student_number,
      firstName: student.first_name, middleName: student.mid_name, lastName: student.last_name,
      suffix: student.suffix, nickname: student.nickname,
      birthDate: student.studentDetail?.birth_date.toISOString().slice(0, 10) ?? null,
      department: student.department, program: student.course, major: student.major,
      graduationYear: student.grad_year, graduationTerm: student.grad_term,
      thesisTitle: student.thesis_title,
      schoolEmail: student.school_email, personalEmail: student.personal_email,
      contactNumber: student.studentDetail?.contact_num ?? null,
      province: student.studentDetail?.province ?? null,
      city: student.studentDetail?.city ?? null,
      barangay: student.studentDetail?.barangay ?? null,
      mothersName: student.studentDetail?.mothers_name ?? null,
      mothersTitle: student.studentDetail?.mothers_title ?? null,
      fathersName: student.studentDetail?.fathers_name ?? null,
      fathersTitle: student.studentDetail?.fathers_title ?? null,
      guardiansName: student.studentDetail?.guardians_name ?? null,
      guardiansTitle: student.studentDetail?.guardians_title ?? null,
      solicitations: student.studentSolicitations,
      referencePhotoUrl,
      referencePhotoPresent: !!student.studentDetail?.photo_url,
      record: {
        accountStatus: student.studentAuth?.status ?? null,
        registeredAt: student.created_at,
        updatedAt: student.updated_at,
        photoSession: booking ? {
          date: booking.booking_day.date, period: booking.period,
          startTime: booking.booking_slot?.start_time ?? null,
          endTime: booking.booking_slot?.end_time ?? null,
        } : null,
        attendanceRecorded: !!student.attendanceQueue,
      },
    },
  };
}
