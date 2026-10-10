import { ReviewCapability } from "@prisma/client";
import prisma from "../../config/prisma";
import { matchesGraduateScope, type GraduateScope } from "./review_scope";

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

export { grantAssignment, revokeAssignment } from "./staff_assignment_service";
