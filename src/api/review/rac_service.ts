import { AdminRoles, Prisma, RacOutcome, ReviewCapability, ReviewEventAction, ReviewTrackType } from "@prisma/client";
import prisma from "../../config/prisma";
import { matchesGraduateScope, type GraduateScope, type ReviewScope } from "./review_scope";
import { canAdvanceVerification, verificationRequestHash, type Cycle, type VerificationBatch, type VerificationStatus } from "./rac_contract";

export class ReviewRequestError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function graduateScopeWhere(assignments: readonly ReviewScope[]): Prisma.StudentWhereInput {
  if (assignments.some(item => !item.department)) return {};
  return {
    OR: assignments.map(item => ({
      department: item.department,
      ...(item.course ? { course: item.course } : {}),
      ...(item.major ? { major: item.major } : {}),
    })),
  };
}

async function checkerScopes(adminId: number, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const admin = await client.admin.findUnique({ where: { id: adminId }, select: { id: true, role: true } });
  if (!admin || !Object.values(AdminRoles).includes(admin.role)) {
    throw new ReviewRequestError(403, "FORBIDDEN", "Staff account unavailable.");
  }
  const assignments = await client.reviewAssignment.findMany({
    where: { admin_id: adminId, capability: ReviewCapability.RAC_CHECK, revoked_at: null },
    select: { department: true, course: true, major: true },
  });
  if (assignments.length === 0) throw new ReviewRequestError(403, "FORBIDDEN", "RAC/SAO assignment required.");
  return assignments;
}

export type VerificationListQuery = Cycle & {
  page: number;
  status: VerificationStatus;
  department: string | null;
  course: string | null;
  major: string | null;
  search: string;
};

function searchWhere(search: string): Prisma.StudentWhereInput {
  const terms = search.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return {};
  if (/^\d+$/.test(search) && Number(search) <= 2147483647) {
    return { student_number: Number(search) };
  }
  return {
    AND: terms.map(term => ({
      OR: [
        { first_name: { contains: term, mode: "insensitive" } },
        { mid_name: { contains: term, mode: "insensitive" } },
        { last_name: { contains: term, mode: "insensitive" } },
      ],
    })),
  };
}

function statusWhere(status: VerificationStatus, cycle: Cycle): Prisma.StudentWhereInput {
  const inCycle = { grad_year: cycle.year, grad_term: cycle.term };
  if (status === "ALL") return {};
  if (status === "UNCHECKED") return { reviewCases: { none: inCycle } };
  return { reviewCases: { some: { ...inCycle, outcome: status } } };
}

export async function listVerificationGraduates(adminId: number, query: VerificationListQuery) {
  const scopes = await checkerScopes(adminId);
  const base: Prisma.StudentWhereInput = {
    grad_year: query.year,
    grad_term: query.term,
    ...graduateScopeWhere(scopes),
  };
  const filtered: Prisma.StudentWhereInput = {
    ...base,
    ...(query.department ? { department: query.department } : {}),
    ...(query.course ? { course: query.course } : {}),
    ...(query.major === "__no_major__" ? { major: null } : query.major ? { major: query.major } : {}),
    ...searchWhere(query.search),
  };
  const inStatus = { ...filtered, ...statusWhere(query.status, query) };
  const caseCycle = { grad_year: query.year, grad_term: query.term };
  const [students, total, all, unchecked, verified, notListed] = await Promise.all([
    prisma.student.findMany({
      where: inStatus, skip: (query.page - 1) * 25, take: 25,
      orderBy: [{ first_name: "asc" }, { last_name: "asc" }, { student_number: "asc" }],
      select: {
        student_number: true, first_name: true, mid_name: true, last_name: true, suffix: true,
        department: true, course: true, major: true,
        reviewCases: { where: caseCycle, select: { outcome: true, version: true, checked_at: true, source_version: true } },
      },
    }),
    prisma.student.count({ where: inStatus }),
    prisma.student.count({ where: filtered }),
    prisma.student.count({ where: { ...filtered, ...statusWhere("UNCHECKED", query) } }),
    prisma.student.count({ where: { ...filtered, ...statusWhere(RacOutcome.VERIFIED, query) } }),
    prisma.student.count({ where: { ...filtered, ...statusWhere(RacOutcome.NOT_LISTED, query) } }),
  ]);

  return {
    success: true,
    rows: students.map(student => ({
      studentNumber: student.student_number,
      firstName: student.first_name,
      middleName: student.mid_name,
      lastName: student.last_name,
      suffix: student.suffix,
      department: student.department,
      program: student.course,
      major: student.major,
      verification: student.reviewCases[0]?.outcome ?? "UNCHECKED",
      version: student.reviewCases[0]?.version ?? null,
      checkedAt: student.reviewCases[0]?.checked_at ?? null,
      sourceVersion: student.reviewCases[0]?.source_version ?? null,
    })),
    page: query.page,
    pageSize: 25,
    total,
    sourceVersion: process.env.RAC_SOURCE_VERSION?.trim() || null,
    counts: { all, unchecked, verified, notListed },
  };
}

export async function verificationFilterOptions(adminId: number, cycle: Cycle, department: string | null, course: string | null) {
  const scopes = await checkerScopes(adminId);
  const base: Prisma.StudentWhereInput = {
    grad_year: cycle.year, grad_term: cycle.term, ...graduateScopeWhere(scopes),
  };
  const [departments, courses, majors] = await Promise.all([
    prisma.student.findMany({ where: base, distinct: ["department"], select: { department: true } }),
    prisma.student.findMany({ where: { ...base, ...(department ? { department } : {}) }, distinct: ["course"], select: { course: true } }),
    prisma.student.findMany({ where: { ...base, ...(department ? { department } : {}), ...(course ? { course } : {}) }, distinct: ["major"], select: { major: true } }),
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

export async function verificationHistory(adminId: number, studentNumber: number, cycle: Cycle) {
  const scopes = await checkerScopes(adminId);
  const student = await prisma.student.findUnique({
    where: { student_number: studentNumber },
    select: { id: true, department: true, course: true, major: true, grad_year: true, grad_term: true },
  });
  if (!student || student.grad_year !== cycle.year || student.grad_term !== cycle.term ||
      !scopes.some(scope => matchesGraduateScope(scope, student))) {
    throw new ReviewRequestError(404, "NOT_FOUND", "Graduate not found.");
  }
  const reviewCase = await prisma.reviewCase.findUnique({
    where: { student_id_grad_year_grad_term: { student_id: student.id, grad_year: cycle.year, grad_term: cycle.term } },
    select: {
      events: {
        orderBy: [{ created_at: "desc" }, { id: "desc" }], take: 20,
        select: { id: true, action: true, previous_outcome: true, new_outcome: true, source_version: true, created_at: true,
          actor: { select: { first_name: true, last_name: true } } },
      },
    },
  });
  return { success: true, events: reviewCase?.events ?? [] };
}

function canCheck(scopes: readonly ReviewScope[], graduate: GraduateScope) {
  return scopes.some(scope => matchesGraduateScope(scope, graduate));
}

export async function verifyGraduateBatch(adminId: number, batch: VerificationBatch) {
  const sourceVersion = process.env.RAC_SOURCE_VERSION?.trim();
  if (!sourceVersion || sourceVersion.length > 100) {
    throw new ReviewRequestError(503, "SOURCE_UNCONFIGURED", "The official RAC/SAO list version is not configured.");
  }
  if (sourceVersion !== batch.sourceVersion) {
    throw new ReviewRequestError(409, "SOURCE_CHANGED", "The official list version changed. Refresh before checking graduates.");
  }
  const requestHash = verificationRequestHash(batch);
  const sortedNumbers = [...batch.studentNumbers].sort((a, b) => a - b);
  try {
    return await prisma.$transaction(async tx => {
      const scopes = await checkerScopes(adminId, tx);
      const operation = await tx.reviewOperation.create({
        data: { actor_id: adminId, client_key: batch.operationId, request_hash: requestHash },
        select: { id: true },
      });
      const students = await tx.student.findMany({
        where: { student_number: { in: sortedNumbers }, grad_year: batch.year, grad_term: batch.term },
        select: { id: true, student_number: true, department: true, course: true, major: true },
      });
      if (students.length !== sortedNumbers.length || students.some(student => !canCheck(scopes, student))) {
        throw new ReviewRequestError(404, "NOT_FOUND", "One or more graduates are unavailable.");
      }

      const cases = await tx.reviewCase.findMany({
        where: { student_id: { in: students.map(student => student.id) }, grad_year: batch.year, grad_term: batch.term },
        select: { id: true, student_id: true, outcome: true, version: true },
      });
      const byStudentId = new Map(cases.map(item => [item.student_id, item]));
      const byNumber = new Map(students.map(item => [item.student_number, item]));
      const results: { studentNumber: number; outcome: RacOutcome; version: number }[] = [];

      for (const studentNumber of sortedNumbers) {
        const student = byNumber.get(studentNumber)!;
        const existing = byStudentId.get(student.id);
        const expected = batch.expectedVersions[String(studentNumber)];
        if (!canAdvanceVerification(existing ?? null, expected ?? null, batch.outcome)) {
          throw new ReviewRequestError(409, "STALE_VERIFICATION", "The verification list changed. Refresh and try again.");
        }

        let reviewCase: { id: number; version: number };
        if (existing) {
          const updated = await tx.reviewCase.updateMany({
            where: { id: existing.id, version: existing.version, outcome: RacOutcome.NOT_LISTED },
            data: { outcome: batch.outcome, checked_by: adminId, checked_at: new Date(), source_version: sourceVersion, version: { increment: 1 } },
          });
          if (updated.count !== 1) throw new ReviewRequestError(409, "STALE_VERIFICATION", "The verification list changed. Refresh and try again.");
          reviewCase = { id: existing.id, version: existing.version + 1 };
        } else {
          reviewCase = await tx.reviewCase.create({
            data: { student_id: student.id, grad_year: batch.year, grad_term: batch.term, outcome: batch.outcome, checked_by: adminId, source_version: sourceVersion },
            select: { id: true, version: true },
          });
        }

        if (batch.outcome === RacOutcome.VERIFIED) {
          await tx.reviewTrack.createMany({
            data: [ReviewTrackType.INFORMATION, ReviewTrackType.PHOTOS].map(type => ({ case_id: reviewCase.id, type })),
          });
        }
        await tx.reviewEvent.create({
          data: {
            case_id: reviewCase.id, actor_id: adminId, operation_id: operation.id,
            action: batch.outcome === RacOutcome.VERIFIED ? ReviewEventAction.RAC_VERIFIED : ReviewEventAction.RAC_NOT_LISTED,
            previous_outcome: existing?.outcome ?? null, new_outcome: batch.outcome, source_version: sourceVersion,
          },
        });
        results.push({ studentNumber, outcome: batch.outcome, version: reviewCase.version });
      }

      const response = { success: true, results };
      await tx.reviewOperation.update({ where: { id: operation.id }, data: { response } });
      return response;
    }, { maxWait: 5000, timeout: 30000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const previous = await prisma.reviewOperation.findUnique({
        where: { actor_id_client_key: { actor_id: adminId, client_key: batch.operationId } },
        select: { request_hash: true, response: true },
      });
      if (previous) {
        if (previous.request_hash !== requestHash) {
          throw new ReviewRequestError(409, "OPERATION_REUSED", "This request ID was used for different records.");
        }
        if (!previous.response) throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "This verification request did not complete. Refresh and try again.");
        return previous.response;
      }
      throw new ReviewRequestError(409, "STALE_VERIFICATION", "The verification list changed. Refresh and try again.");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2034"].includes(error.code)) {
      throw new ReviewRequestError(409, "STALE_VERIFICATION", "The verification list changed. Refresh and try again.");
    }
    throw error;
  }
}
