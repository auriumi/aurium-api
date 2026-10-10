import { AdminRoles, Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { generateReadUrl } from "../student/r2_service";
import { signedPhotoRead } from "../review/photo_storage";
import { ReviewRequestError } from "../review/review_error";

export async function masterlistDetail(adminId: number, studentNumber: number) {
  const { student, tracks } = await prisma.$transaction(async tx => {
    const actor = await tx.admin.findUnique({ where: { id: adminId }, select: { role: true } });
    if (!actor || !Object.values(AdminRoles).includes(actor.role)) {
      throw new ReviewRequestError(403, "FORBIDDEN", "Staff account unavailable.");
    }
    const student = await tx.student.findUnique({
      where: { student_number: studentNumber },
      include: { studentDetail: true, studentAuth: { select: { status: true } } },
    });
    if (!student) throw new ReviewRequestError(404, "NOT_FOUND", "Graduate not found.");
    const review = await tx.reviewCase.findUnique({
      where: { student_id_grad_year_grad_term: {
        student_id: student.id, grad_year: student.grad_year, grad_term: student.grad_term,
      } },
      select: { outcome: true, tracks: { select: {
        type: true, stage: true,
        informationEvents: { where: { action: "LOCKED" }, orderBy: { track_version: "desc" }, take: 1,
          select: { created_at: true } },
        photoEvents: { where: { action: "LOCKED" }, orderBy: { track_version: "desc" }, take: 1,
          select: { created_at: true, pair: { select: {
            graduationAsset: { select: { status: true, final_key: true, type: true } },
            themeAsset: { select: { status: true, final_key: true, type: true } },
          } } } },
      } } },
    });
    return { student, tracks: review?.outcome === "VERIFIED" ? review.tracks : [] };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  const information = tracks.find(track => track.type === "INFORMATION");
  const photos = tracks.find(track => track.type === "PHOTOS");
  // Reopening changes the current stage. Publication still follows the last
  // final approval, never the newest upload or the current draft pair.
  const approvedPhoto = photos?.photoEvents[0];
  const pair = approvedPhoto?.pair;
  const validPair = pair?.graduationAsset.status === "SEALED" && pair.themeAsset.status === "SEALED" &&
    pair.graduationAsset.type === "GRADUATION" && pair.themeAsset.type === "THEME" &&
    pair.graduationAsset.final_key && pair.themeAsset.final_key;
  const [reference, graduation, theme] = await Promise.all([
    student.studentDetail?.photo_url ? generateReadUrl(student.studentDetail.photo_url) : null,
    validPair ? signedPhotoRead(pair.graduationAsset.final_key!) : null,
    validPair ? signedPhotoRead(pair.themeAsset.final_key!) : null,
  ]);
  return { success: true, student: {
    ...student,
    studentDetail: student.studentDetail ? { ...student.studentDetail, photo_url: reference } : null,
    photo_grad: graduation, photo_creative: theme,
    review: {
      information: { stage: information?.stage ?? null,
        approvedAt: information?.informationEvents[0]?.created_at ?? null,
        correctionInProgress: !!information?.informationEvents.length && information.stage !== "LOCKED" },
      photos: { stage: photos?.stage ?? null, approvedAt: approvedPhoto?.created_at ?? null,
        correctionInProgress: !!approvedPhoto && photos?.stage !== "LOCKED",
        status: validPair ? "APPROVED" : approvedPhoto ? "UNAVAILABLE" : "AWAITING_APPROVAL" },
    },
  } };
}
