import { AdminRoles, Prisma, ReviewCapability } from "@prisma/client";
import prisma from "../../config/prisma";
import { readReviewScope } from "./review_scope";
import { ReviewRequestError } from "./review_error";

const operationalCapabilities: ReviewCapability[] = [
  "INFORMATION_PROOFREADER", "INFORMATION_QC", "PHOTO_UPLOADER", "PHOTO_QC",
];
const administratorCapabilities = [...operationalCapabilities, ReviewCapability.FINAL_MODERATOR, ReviewCapability.IT_CORRECTION];
const assignmentSelect = { id: true, admin_id: true, capability: true, department: true, course: true, major: true } as const;

async function managerCapabilities(actorId: number, client: Prisma.TransactionClient = prisma) {
  const actor = await client.admin.findUnique({ where: { id: actorId }, select: { role: true } });
  if (actor?.role === AdminRoles.ADMINISTRATOR) return administratorCapabilities;
  if (actor?.role === AdminRoles.MODERATOR && await client.reviewAssignment.findFirst({
    where: { admin_id: actorId, capability: "FINAL_MODERATOR", revoked_at: null }, select: { id: true },
  })) return operationalCapabilities;
  throw new ReviewRequestError(403, "FORBIDDEN", "Administrator or designated moderator access required.");
}

export async function listReviewStaff(actorId: number, search: string, page: number) {
  const capabilities = await managerCapabilities(actorId);
  const where: Prisma.AdminWhereInput = search ? { OR: ["first_name", "last_name", "email"].map(field => ({
    [field]: { contains: search, mode: "insensitive" },
  })) } : {};
  const [staff, total] = await Promise.all([
    prisma.admin.findMany({ where, skip: (page - 1) * 25, take: 25,
      orderBy: [{ first_name: "asc" }, { last_name: "asc" }, { id: "asc" }],
      select: { id: true, first_name: true, last_name: true, email: true, role: true,
        reviewAssignments: { where: { revoked_at: null }, select: assignmentSelect, orderBy: { id: "asc" } } },
    }),
    prisma.admin.count({ where }),
  ]);
  return { success: true, staff, total, page, pageSize: 25, assignableCapabilities: capabilities };
}

// Assignment writes are rare. Serialize them to protect the single moderator
// rule and recheck the manager while their account cannot be demoted mid-write.
async function lockAssignmentManagement(tx: Prisma.TransactionClient, actorId: number) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(4282608)::text`;
  await tx.$queryRaw`SELECT id FROM "Admin" WHERE id = ${actorId} FOR UPDATE`;
  return managerCapabilities(actorId, tx);
}

export async function grantAssignment(actorId: number, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { status: 400, reason: "Invalid assignment." };
  const fields = input as Record<string, unknown>;
  if (Object.keys(fields).some(key => !["adminId", "capability", "scope"].includes(key)) ||
      !Number.isSafeInteger(fields.adminId) || Number(fields.adminId) <= 0 ||
      typeof fields.capability !== "string" || !Object.values(ReviewCapability).includes(fields.capability as ReviewCapability)) {
    return { status: 400, reason: "Invalid assignment fields." };
  }
  const capability = fields.capability as ReviewCapability;
  const scope = readReviewScope(fields.scope);
  if (!scope || (capability === "FINAL_MODERATOR" && (scope.department || scope.course || scope.major))) {
    return { status: 400, reason: "Choose an explicit valid assignment scope." };
  }
  try {
    return await prisma.$transaction(async tx => {
      const capabilities = await lockAssignmentManagement(tx, actorId);
      if (capability === "RAC_CHECK") return { status: 400, reason: "General Proofreaders already verify the RAC/SAO list. Assign General Proofreader instead." };
      if (!capabilities.includes(capability)) return { status: 403, reason: "Only an administrator can manage this designation." };
      const adminId = Number(fields.adminId);
      const target = await tx.admin.findUnique({ where: { id: adminId }, select: { id: true, role: true } });
      if (!target) return { status: 404, reason: "Staff member not found." };
      if (capability === "FINAL_MODERATOR") {
        if (target.role !== AdminRoles.ADMINISTRATOR && target.role !== AdminRoles.MODERATOR) {
          return { status: 400, reason: "The final moderator must have a Moderator or Administrator account role." };
        }
        if (await tx.reviewAssignment.findFirst({ where: { capability, revoked_at: null }, select: { id: true } })) {
          return { status: 409, reason: "A final moderator is already assigned. Revoke that assignment before replacing it." };
        }
      }
      const assignment = await tx.reviewAssignment.create({
        data: { admin_id: adminId, capability, ...scope, granted_by: actorId }, select: assignmentSelect,
      });
      return { status: 201, assignment };
    });
  } catch (error) {
    if (error instanceof ReviewRequestError) return { status: error.status, reason: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: 409, reason: "This active assignment already exists." };
    }
    throw error;
  }
}

export async function revokeAssignment(actorId: number, assignmentId: number) {
  try {
    return await prisma.$transaction(async tx => {
      const capabilities = await lockAssignmentManagement(tx, actorId);
      const assignment = await tx.reviewAssignment.findFirst({ where: { id: assignmentId, revoked_at: null }, select: { capability: true } });
      if (!assignment) return { status: 404, reason: "Active assignment not found." };
      const canRemoveRetiredRac = assignment.capability === "RAC_CHECK" && capabilities.includes("FINAL_MODERATOR");
      if (!capabilities.includes(assignment.capability) && !canRemoveRetiredRac) {
        return { status: 403, reason: "Only an administrator can manage this designation." };
      }
      await tx.reviewAssignment.update({ where: { id: assignmentId }, data: { revoked_at: new Date(), revoked_by: actorId } });
      return { status: 200, success: true };
    });
  } catch (error) {
    if (error instanceof ReviewRequestError) return { status: error.status, reason: error.message };
    throw error;
  }
}
