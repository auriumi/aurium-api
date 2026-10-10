import { createHash } from "node:crypto";
import {
  ImageType, PhotoEventAction, PhotoUploadStatus, Prisma, RacOutcome,
  ReviewCapability, ReviewStage, ReviewTrackType,
} from "@prisma/client";
import prisma from "../../config/prisma";
import { generateReadUrl } from "../student/r2_service";
import { graduateScopeWhere, graduateSearchWhere } from "./review_filters";
import { matchesGraduateScope } from "./review_scope";
import { ReviewRequestError } from "./review_error";
import { sealPhoto, signedPhotoRead, signedPhotoUpload, stagingKey } from "./photo_storage";
import { canSubmitPair, type readPhotoUpload } from "./photo_contract";
import { requiresMakerChange } from "./correction_contract";
import type { InformationSubmission } from "./information_submission_contract";
import type { Cycle } from "./rac_contract";

type UploadInput = NonNullable<ReturnType<typeof readPhotoUpload>>;
const photoCapabilities: ReviewCapability[] = [ReviewCapability.PHOTO_UPLOADER, ReviewCapability.PHOTO_QC,
  ReviewCapability.FINAL_MODERATOR, ReviewCapability.IT_CORRECTION];
const editableStages: ReviewStage[] = [ReviewStage.DRAFT, ReviewStage.REJECTED_QC, ReviewStage.REJECTED_MODERATOR];

async function scopesFor(adminId: number, capabilities = photoCapabilities,
  client: Prisma.TransactionClient | typeof prisma = prisma) {
  const staff = await client.admin.findUnique({ where: { id: adminId }, select: { id: true } });
  if (!staff) throw new ReviewRequestError(403, "FORBIDDEN", "Staff account unavailable.");
  const assignments = await client.reviewAssignment.findMany({
    where: { admin_id: adminId, capability: { in: capabilities }, revoked_at: null },
    select: { capability: true, department: true, course: true, major: true },
  });
  if (!assignments.length) throw new ReviewRequestError(403, "FORBIDDEN", "Photo review assignment required.");
  return assignments;
}

export async function assignedPhotoTrack(client: Prisma.TransactionClient | typeof prisma, adminId: number, reviewId: number,
  capabilities: ReviewCapability[] = [ReviewCapability.PHOTO_UPLOADER]) {
  const scopes = await scopesFor(adminId, capabilities, client);
  const track = await client.reviewTrack.findUnique({
    where: { id: reviewId },
    select: { id: true, type: true, stage: true, version: true,
      reviewCase: { select: { outcome: true, grad_year: true, grad_term: true,
        student: { select: { id: true, student_number: true, grad_year: true, grad_term: true,
          department: true, course: true, major: true } } } },
    },
  });
  const reviewCase = track?.reviewCase;
  const student = reviewCase?.student;
  if (!track || track.type !== ReviewTrackType.PHOTOS || !reviewCase || !student ||
      reviewCase.outcome !== RacOutcome.VERIFIED ||
      student.grad_year !== reviewCase.grad_year || student.grad_term !== reviewCase.grad_term ||
      !scopes.some(scope => matchesGraduateScope(scope, student))) {
    throw new ReviewRequestError(404, "NOT_FOUND", "Photo review not found.");
  }
  return { track, student };
}

function assertEditable(stage: ReviewStage, version: number, expectedVersion: number) {
  if (!editableStages.includes(stage)) throw new ReviewRequestError(409, "STAGE_CHANGED", "This photo review is read-only.");
  if (version !== expectedVersion) throw new ReviewRequestError(409, "STALE_REVIEW", "The review changed. Refresh before uploading.");
}

export async function listPhotoReviews(adminId: number, cycle: Cycle, page: number, search: string,
  department: string | null, course: string | null, major: string | null, stage: ReviewStage | "ALL") {
  const scopes = await scopesFor(adminId);
  const base: Prisma.StudentWhereInput = { AND: [
    { grad_year: cycle.year, grad_term: cycle.term }, graduateScopeWhere(scopes), graduateSearchWhere(search),
    ...(department ? [{ department }] : []), ...(course ? [{ course }] : []),
    ...(major === "__no_major__" ? [{ major: null }] : major ? [{ major }] : []),
  ] };
  const cycleCase = { grad_year: cycle.year, grad_term: cycle.term };
  const where: Prisma.StudentWhereInput = stage === "ALL" ? base : { AND: [base, {
    reviewCases: { some: { ...cycleCase, outcome: RacOutcome.VERIFIED,
      tracks: { some: { type: ReviewTrackType.PHOTOS, stage } } } },
  }] };
  const [rows, all, counts] = await Promise.all([
    prisma.student.findMany({ where, skip: (page - 1) * 25, take: 25,
      orderBy: [{ first_name: "asc" }, { id: "asc" }],
      select: { student_number: true, first_name: true, mid_name: true, last_name: true, suffix: true,
        department: true, course: true, major: true,
        reviewCases: { where: cycleCase, take: 1, select: { outcome: true,
          tracks: { where: { type: ReviewTrackType.PHOTOS }, take: 1,
            select: { id: true, stage: true, version: true } } } },
      },
    }),
    prisma.student.count({ where: base }),
    prisma.reviewTrack.groupBy({ by: ["stage"], where: { type: ReviewTrackType.PHOTOS,
      reviewCase: { is: { ...cycleCase, outcome: RacOutcome.VERIFIED, student: { is: base } } },
    }, _count: { _all: true } }),
  ]);
  return { success: true, rows: rows.map(student => {
    const reviewCase = student.reviewCases[0];
    const track = reviewCase?.outcome === RacOutcome.VERIFIED ? reviewCase.tracks[0] : null;
    return {
      reviewId: track?.id ?? null, stage: track?.stage ?? null, version: track?.version ?? null,
      verification: reviewCase?.outcome ?? "UNCHECKED",
      studentNumber: student.student_number,
      firstName: student.first_name, middleName: student.mid_name,
      lastName: student.last_name, suffix: student.suffix,
      department: student.department, program: student.course, major: student.major,
    };
  }), page, pageSize: 25, total: stage === 'ALL' ? all : counts.find(item => item.stage === stage)?._count._all ?? 0,
  counts: { ALL: all, ...Object.fromEntries(counts.map(item => [item.stage, item._count._all])) },
  };
}

export async function photoFilterOptions(adminId: number, cycle: Cycle, department: string | null, course: string | null) {
  const scopes = await scopesFor(adminId);
  const base: Prisma.StudentWhereInput = { grad_year: cycle.year, grad_term: cycle.term,
    AND: [graduateScopeWhere(scopes)],
  };
  const [departments, courses, majors] = await Promise.all([
    prisma.student.findMany({ where: base, distinct: ["department"], select: { department: true } }),
    prisma.student.findMany({ where: { AND: [base, ...(department ? [{ department }] : [])] },
      distinct: ["course"], select: { course: true } }),
    prisma.student.findMany({ where: { AND: [base, ...(department ? [{ department }] : []),
      ...(course ? [{ course }] : [])] }, distinct: ["major"], select: { major: true } }),
  ]);
  const names = (values: readonly (string | null)[]) => [...new Set(values.filter((value): value is string => !!value))]
    .sort((a, b) => a.localeCompare(b));
  return { success: true, departments: names(departments.map(item => item.department)),
    programs: names(courses.map(item => item.course)), majors: names(majors.map(item => item.major)),
    hasNoMajor: majors.some(item => item.major === null) };
}

export async function photoReviewDetail(adminId: number, reviewId: number) {
  const { track, student: owner } = await assignedPhotoTrack(prisma, adminId, reviewId, photoCapabilities);
  const [student, graduationAsset, themeAsset, pair, submitted, approved, forwarded, assignments, correction] = await Promise.all([
    prisma.student.findUnique({ where: { id: owner.id }, select: {
      student_number: true, first_name: true, mid_name: true, last_name: true, suffix: true, nickname: true,
      school_email: true, personal_email: true, department: true, course: true, major: true,
      thesis_title: true, grad_year: true, grad_term: true,
      created_at: true, updated_at: true,
      studentDetail: { select: { birth_date: true, province: true, city: true, barangay: true,
        mothers_name: true, mothers_title: true, fathers_name: true, fathers_title: true,
        guardians_name: true, guardians_title: true, contact_num: true, photo_url: true } },
      studentSolicitations: { orderBy: { slot: "asc" }, select: { slot: true, type: true, title: true, name: true } },
      studentAuth: { select: { status: true } },
      booking: { orderBy: { created_at: "desc" }, take: 1,
        select: { period: true, booking_day: { select: { date: true } },
          booking_slot: { select: { start_time: true, end_time: true } } } },
      attendanceQueue: { select: { id: true } },
    } }),
    prisma.photoAsset.findFirst({ where: { track_id: reviewId, type: ImageType.GRADUATION, status: PhotoUploadStatus.SEALED },
      orderBy: [{ sealed_at: "desc" }, { id: "desc" }],
      select: { id: true, type: true, final_key: true, byte_size: true, sealed_at: true },
    }),
    prisma.photoAsset.findFirst({ where: { track_id: reviewId, type: ImageType.THEME, status: PhotoUploadStatus.SEALED },
      orderBy: [{ sealed_at: "desc" }, { id: "desc" }],
      select: { id: true, type: true, final_key: true, byte_size: true, sealed_at: true },
    }),
    prisma.photoPairRevision.findFirst({ where: { track_id: reviewId },
      orderBy: { track_version: "desc" }, select: { id: true, track_version: true,
        graduation_asset_id: true, theme_asset_id: true } }),
    prisma.photoReviewEvent.findFirst({ where: { track_id: reviewId, action: PhotoEventAction.SUBMITTED_QC },
      orderBy: { track_version: "desc" }, select: { pair_id: true } }),
    prisma.photoReviewEvent.findFirst({ where: { track_id: reviewId, action: PhotoEventAction.APPROVED_QC },
      orderBy: { track_version: "desc" }, select: { pair_id: true } }),
    prisma.photoReviewEvent.findFirst({ where: { track_id: reviewId, action: PhotoEventAction.SUBMITTED_MODERATOR },
      orderBy: { track_version: "desc" }, select: { pair_id: true } }),
    prisma.reviewAssignment.findMany({ where: { admin_id: adminId,
      capability: { in: photoCapabilities }, revoked_at: null },
      select: { capability: true, department: true, course: true, major: true } }),
    prisma.correctionRequest.findFirst({ where: { track_id: reviewId },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { id: true, status: true, reason: true, created_at: true,
        decided_at: true, decision_note: true, reopened_version: true } }),
  ]);
  if (!student || student.grad_year !== owner.grad_year || student.grad_term !== owner.grad_term) {
    throw new ReviewRequestError(409, "SOURCE_CHANGED", "The graduate cycle changed. Refresh the review.");
  }
  const latest = [graduationAsset, themeAsset];
  const [graduation, theme] = await Promise.all(latest.map(async asset => asset?.final_key ? {
    assetId: asset.id, url: await signedPhotoRead(asset.final_key), byteSize: asset.byte_size, sealedAt: asset.sealed_at,
  } : null));
  let referencePhotoUrl: string | null = null;
  if (student.studentDetail?.photo_url) {
    try { referencePhotoUrl = await generateReadUrl(student.studentDetail.photo_url); }
    catch { console.error("Unable to sign photo review reference", reviewId); }
  }
  const hasRole = (capability: ReviewCapability) => assignments.some(scope =>
    scope.capability === capability && matchesGraduateScope(scope, owner));
  const canUpload = editableStages.includes(track.stage) && hasRole(ReviewCapability.PHOTO_UPLOADER);
  const pairReady = canSubmitPair(track.stage, pair?.track_version ?? null,
    track.version) &&
    !requiresMakerChange(correction?.status, correction?.reopened_version, pair?.track_version);
  const actions: string[] = canUpload ? ["UPLOAD", ...(pairReady ? ["SUBMIT_QC"] : [])] : [];
  if (track.stage === ReviewStage.LOCKED && correction?.status !== "PENDING" &&
      [ReviewCapability.PHOTO_UPLOADER, ReviewCapability.PHOTO_QC, ReviewCapability.FINAL_MODERATOR].some(hasRole)) {
    actions.push("REQUEST_CORRECTION");
  }
  if (pair && submitted?.pair_id === pair.id && hasRole(ReviewCapability.PHOTO_QC)) {
    if (track.stage === ReviewStage.SUBMITTED_QC) actions.push("QC_APPROVE", "QC_REJECT");
    if (track.stage === ReviewStage.APPROVED_QC && approved?.pair_id === pair.id) actions.push("FORWARD_MODERATOR");
  }
  if (pair && track.stage === ReviewStage.SUBMITTED_MODERATOR &&
      approved?.pair_id === pair.id && forwarded?.pair_id === pair.id &&
      hasRole(ReviewCapability.FINAL_MODERATOR)) {
    const moderators = await prisma.reviewAssignment.findMany({ where: {
      capability: ReviewCapability.FINAL_MODERATOR, revoked_at: null },
      select: { admin_id: true }, distinct: ["admin_id"], take: 2 });
    if (moderators.length === 1 && moderators[0]?.admin_id === adminId) {
      actions.push("MODERATOR_APPROVE", "MODERATOR_REJECT");
    }
  }
  if ([ReviewCapability.PHOTO_UPLOADER, ReviewCapability.PHOTO_QC,
    ReviewCapability.FINAL_MODERATOR].some(hasRole)) actions.push("COMMENT");
  const booking = student.booking[0];
  return { success: true, reviewId, stage: track.stage, version: track.version,
    availableActions: actions,
    correction,
    pair: pair ? { revisionId: pair.id, version: pair.track_version,
      graduationAssetId: pair.graduation_asset_id, themeAssetId: pair.theme_asset_id } : null,
    photos: { graduation, theme, reference: referencePhotoUrl,
      referencePresent: !!student.studentDetail?.photo_url },
    profile: { studentNumber: student.student_number, firstName: student.first_name,
      middleName: student.mid_name, lastName: student.last_name, suffix: student.suffix,
      nickname: student.nickname, schoolEmail: student.school_email, personalEmail: student.personal_email,
      department: student.department, program: student.course, major: student.major,
      graduationYear: student.grad_year, graduationTerm: student.grad_term,
      thesisTitle: student.thesis_title, birthDate: student.studentDetail?.birth_date.toISOString().slice(0, 10) ?? null,
      contactNumber: student.studentDetail?.contact_num ?? null,
      province: student.studentDetail?.province ?? null, city: student.studentDetail?.city ?? null,
      barangay: student.studentDetail?.barangay ?? null,
      mothersName: student.studentDetail?.mothers_name ?? null, mothersTitle: student.studentDetail?.mothers_title ?? null,
      fathersName: student.studentDetail?.fathers_name ?? null, fathersTitle: student.studentDetail?.fathers_title ?? null,
      guardiansName: student.studentDetail?.guardians_name ?? null, guardiansTitle: student.studentDetail?.guardians_title ?? null,
      solicitations: student.studentSolicitations,
      record: { accountStatus: student.studentAuth?.status ?? null,
        registeredAt: student.created_at, updatedAt: student.updated_at,
        photoSession: booking ? { date: booking.booking_day.date, period: booking.period,
          startTime: booking.booking_slot?.start_time ?? null,
          endTime: booking.booking_slot?.end_time ?? null } : null,
        attendanceRecorded: !!student.attendanceQueue },
    },
  };
}

export async function beginPhotoUpload(adminId: number, reviewId: number, input: UploadInput) {
  const { track } = await assignedPhotoTrack(prisma, adminId, reviewId);
  assertEditable(track.stage, track.version, input.expectedVersion);
  const key = stagingKey(reviewId);
  const uploadUrl = await signedPhotoUpload(key, input.mime);
  const asset = await prisma.photoAsset.create({ data: {
    track_id: reviewId, type: input.type, staging_key: key, mime_type: input.mime, uploaded_by: adminId,
  }, select: { id: true } });
  return { success: true, assetId: asset.id, uploadUrl, expiresInSeconds: 120 };
}

export async function finalizePhotoUpload(adminId: number, reviewId: number, assetId: number, expectedVersion: number) {
  const { track } = await assignedPhotoTrack(prisma, adminId, reviewId);
  const asset = await prisma.photoAsset.findFirst({ where: { id: assetId, track_id: reviewId, uploaded_by: adminId } });
  if (!asset) throw new ReviewRequestError(404, "NOT_FOUND", "Photo upload not found.");
  if (asset.status === PhotoUploadStatus.SEALED) {
    return { success: true, assetId, version: track.version, alreadySealed: true };
  }
  assertEditable(track.stage, track.version, expectedVersion);
  const sealed = await sealPhoto(asset.staging_key, asset.mime_type as UploadInput["mime"], reviewId, asset.type);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ReviewTrack" WHERE id = ${reviewId} FOR UPDATE`;
    const current = await assignedPhotoTrack(tx, adminId, reviewId);
    assertEditable(current.track.stage, current.track.version, expectedVersion);
    const updatedAsset = await tx.photoAsset.updateMany({ where: { id: assetId, track_id: reviewId,
      uploaded_by: adminId, status: PhotoUploadStatus.STAGED },
      data: { status: PhotoUploadStatus.SEALED, final_key: sealed.finalKey,
        byte_size: sealed.byteSize, sha256: sealed.sha256, sealed_at: new Date() } });
    if (updatedAsset.count !== 1) throw new ReviewRequestError(409, "UPLOAD_CHANGED", "This upload was already finalized.");
    const otherType = asset.type === ImageType.GRADUATION ? ImageType.THEME : ImageType.GRADUATION;
    const other = await tx.photoAsset.findFirst({ where: { track_id: reviewId,
      type: otherType, status: PhotoUploadStatus.SEALED },
      orderBy: [{ sealed_at: "desc" }, { id: "desc" }], select: { id: true } });
    await tx.reviewTrack.update({ where: { id: reviewId }, data: { version: { increment: 1 } } });
    const version = expectedVersion + 1;
    const pair = other ? await tx.photoPairRevision.create({ data: {
      track_id: reviewId, track_version: version, created_by: adminId,
      graduation_asset_id: asset.type === ImageType.GRADUATION ? assetId : other.id,
      theme_asset_id: asset.type === ImageType.THEME ? assetId : other.id,
    }, select: { id: true } }) : null;
    return { success: true, assetId, version, pairRevisionId: pair?.id ?? null };
  }, { maxWait: 5000, timeout: 15000 });
}

export async function submitPhotoPair(adminId: number, reviewId: number, input: InformationSubmission) {
  const requestHash = createHash("sha256").update(JSON.stringify([reviewId, input.expectedVersion, input.revisionId])).digest("hex");
  try {
    return await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ReviewTrack" WHERE id = ${reviewId} FOR UPDATE`;
    const { track } = await assignedPhotoTrack(tx, adminId, reviewId);
    const previous = await tx.reviewOperation.findUnique({ where: {
      actor_id_client_key: { actor_id: adminId, client_key: input.operationId },
    }, select: { request_hash: true, response: true } });
    if (previous) {
      if (previous.request_hash !== requestHash) throw new ReviewRequestError(409, "OPERATION_REUSED", "Request ID was used for another action.");
      if (previous.response) return previous.response;
      throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "Refresh and try again.");
    }
    if (track.version !== input.expectedVersion) {
      throw new ReviewRequestError(409, "STAGE_CHANGED", "The pair changed. Refresh before submitting.");
    }
    const pair = await tx.photoPairRevision.findFirst({ where: { track_id: reviewId },
      orderBy: { track_version: "desc" }, select: { id: true, track_version: true } });
    if (!pair || pair.id !== input.revisionId || !canSubmitPair(track.stage, pair.track_version,
      track.version)) {
      throw new ReviewRequestError(409, "PAIR_INCOMPLETE", "Both current photos are required before submission.");
    }
    const reopening = await tx.correctionRequest.findFirst({ where: {
      track_id: reviewId, status: "APPROVED",
    }, orderBy: [{ created_at: "desc" }, { id: "desc" }], select: { reopened_version: true } });
    if (requiresMakerChange("APPROVED", reopening?.reopened_version, pair.track_version)) {
      throw new ReviewRequestError(409, "CORRECTION_REQUIRED", "Replace a photo before resubmitting the reopened pair.");
    }
    const operation = await tx.reviewOperation.create({ data: {
      actor_id: adminId, client_key: input.operationId, request_hash: requestHash,
    }, select: { id: true } });
    const changed = await tx.reviewTrack.updateMany({ where: { id: reviewId, stage: track.stage,
      version: input.expectedVersion }, data: { stage: ReviewStage.SUBMITTED_QC, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ReviewRequestError(409, "STALE_REVIEW", "The pair changed. Refresh.");
    const version = input.expectedVersion + 1;
    await tx.photoReviewEvent.create({ data: { track_id: reviewId, track_version: version,
      pair_id: pair.id, actor_id: adminId, operation_id: operation.id,
      action: PhotoEventAction.SUBMITTED_QC,
      from_stage: track.stage, to_stage: ReviewStage.SUBMITTED_QC } });
    const response = { success: true, reviewId, pairRevisionId: pair.id, version, stage: ReviewStage.SUBMITTED_QC };
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
      throw new ReviewRequestError(409, "STALE_REVIEW", "The photo pair changed. Refresh before submitting.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2034"].includes(error.code)) {
      throw new ReviewRequestError(409, "STALE_REVIEW", "The photo pair changed. Refresh before submitting.");
    }
    throw error;
  }
}
