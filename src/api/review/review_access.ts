import { AdminRoles, Prisma, ReviewCapability } from "@prisma/client";
import prisma from "../../config/prisma";
import { matchesGraduateScope, readReviewScope, type GraduateScope } from "./review_scope";

export async function activeAssignments(adminId: number) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true } });
  if (!admin) return null;
  return prisma.reviewAssignment.findMany({
    where: { admin_id: adminId, revoked_at: null },
    select: { id: true, capability: true, department: true, course: true, major: true },
    orderBy: { id: "asc" },
  });
}

export async function hasCapability(adminId: number, capability: ReviewCapability, graduate?: GraduateScope) {
  const assignments = await activeAssignments(adminId);
  return assignments?.some(assignment => assignment.capability === capability &&
    (!graduate || matchesGraduateScope(assignment, graduate))) ?? false;
}

async function isCurrentAdministrator(adminId: number) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { role: true } });
  return admin?.role === AdminRoles.ADMINISTRATOR;
}

export async function grantAssignment(actorId: number, input: unknown) {
  if (!await isCurrentAdministrator(actorId)) return { status: 403, reason: "Administrator access required." };
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { status: 400, reason: "Invalid assignment." };
  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).some(key => !["adminId", "capability", "scope"].includes(key))) {
    return { status: 400, reason: "Invalid assignment fields." };
  }
  if (!Number.isSafeInteger(fields.adminId) || Number(fields.adminId) <= 0 ||
      typeof fields.capability !== "string" ||
      !Object.values(ReviewCapability).includes(fields.capability as ReviewCapability)) {
    return { status: 400, reason: "Invalid staff member or capability." };
  }
  // An omitted scope must never silently become a global assignment.
  const scope = readReviewScope(fields.scope);
  if (!scope || (fields.capability === ReviewCapability.FINAL_MODERATOR &&
      (scope.department || scope.course || scope.major))) {
    return { status: 400, reason: "Invalid assignment scope." };
  }

  const adminId = Number(fields.adminId);
  const target = await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true } });
  if (!target) return { status: 404, reason: "Staff member not found." };
  try {
    const assignment = await prisma.reviewAssignment.create({
      data: { admin_id: adminId, capability: fields.capability as ReviewCapability, ...scope, granted_by: actorId },
      select: { id: true, admin_id: true, capability: true, department: true, course: true, major: true },
    });
    return { status: 201, assignment };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: 409, reason: "This active assignment already exists." };
    }
    throw error;
  }
}

export async function revokeAssignment(actorId: number, assignmentId: number) {
  if (!await isCurrentAdministrator(actorId)) return { status: 403, reason: "Administrator access required." };
  const result = await prisma.reviewAssignment.updateMany({
    where: { id: assignmentId, revoked_at: null },
    data: { revoked_at: new Date(), revoked_by: actorId },
  });
  return result.count === 1 ? { status: 200, success: true } : { status: 404, reason: "Active assignment not found." };
}
