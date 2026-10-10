import { Prisma } from "@prisma/client";
import type { ReviewScope } from "./review_scope";

export function graduateScopeWhere(assignments: readonly ReviewScope[]): Prisma.StudentWhereInput {
  if (assignments.some(item => !item.department)) return {};
  return {
    OR: assignments.map(item => ({
      department: item.department,
      ...(item.course ? { course: item.course } : {}),
      ...(item.major ? { major: item.major } : {}),
    })),
  };
}

export function graduateSearchWhere(search: string): Prisma.StudentWhereInput {
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
