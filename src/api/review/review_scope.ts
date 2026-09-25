export type ReviewScope = {
  department: string | null;
  course: string | null;
  major: string | null;
};

export type GraduateScope = ReviewScope;

export function matchesGraduateScope(assignment: ReviewScope, graduate: GraduateScope): boolean {
  return (assignment.department === null || assignment.department === graduate.department) &&
    (assignment.course === null || assignment.course === graduate.course) &&
    (assignment.major === null || assignment.major === graduate.major);
}

export function readReviewScope(value: unknown): ReviewScope | null {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some(key => !["department", "course", "major"].includes(key))) return null;

  const readField = (field: unknown): string | null | undefined => {
    if (field === undefined || field === null) return null;
    if (typeof field !== "string") return undefined;
    const trimmed = field.trim();
    return trimmed && trimmed.length <= 120 ? trimmed : undefined;
  };
  const department = readField(fields.department);
  const course = readField(fields.course);
  const major = readField(fields.major);
  if (department === undefined || course === undefined || major === undefined) return null;
  if ((course && !department) || (major && !course)) return null;
  return { department, course, major };
}
