import { createHash } from "crypto";

export const editableProfileFields = [
  "firstName", "middleName", "lastName", "suffix", "nickname", "birthDate",
  "department", "program", "major", "thesisTitle", "contactNumber",
  "province", "city", "barangay", "mothersName", "mothersTitle",
  "fathersName", "fathersTitle", "guardiansName", "guardiansTitle",
] as const;

export type EditableProfileField = typeof editableProfileFields[number];
export type EditableProfile = Record<EditableProfileField, string | null>;
export type DraftSave = {
  expectedVersion: number;
  operationId: string;
  changes: Partial<EditableProfile>;
};

const fieldSet = new Set<string>(editableProfileFields);
const requiredFields = new Set<EditableProfileField>(["firstName", "lastName", "department", "program"]);
const maxLengths: Partial<Record<EditableProfileField, number>> = {
  firstName: 120, middleName: 120, lastName: 120, suffix: 40, nickname: 120,
  department: 120, program: 120, major: 120, thesisTitle: 500,
  contactNumber: 40, province: 120, city: 120, barangay: 120,
  mothersName: 120, mothersTitle: 80, fathersName: 120, fathersTitle: 80,
  guardiansName: 120, guardiansTitle: 80,
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" && date.getTime() <= Date.now();
}

export function readDraftSave(input: unknown): DraftSave | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["expectedVersion", "operationId", "changes"].includes(key)) ||
      !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 1 ||
      typeof value.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId) ||
      !value.changes || typeof value.changes !== "object" || Array.isArray(value.changes)) return null;

  const rawChanges = value.changes as Record<string, unknown>;
  const keys = Object.keys(rawChanges);
  if (keys.length === 0 || keys.length > editableProfileFields.length || keys.some(key => !fieldSet.has(key))) return null;

  const changes: Partial<EditableProfile> = {};
  for (const key of keys as EditableProfileField[]) {
    const raw = rawChanges[key];
    if (raw === null) {
      if (requiredFields.has(key) || key === "birthDate") return null;
      changes[key] = null;
      continue;
    }
    if (typeof raw !== "string" || raw !== raw.trim() || /[\u0000-\u001f\u007f]/.test(raw)) return null;
    if (key === "birthDate") {
      if (!validDate(raw)) return null;
    } else if (raw.length > (maxLengths[key] ?? 120) || (requiredFields.has(key) && !raw)) return null;
    changes[key] = raw || null;
  }
  return {
    expectedVersion: Number(value.expectedVersion),
    operationId: value.operationId.toLowerCase(),
    changes,
  };
}

export function applyDraftChanges(before: EditableProfile, changes: Partial<EditableProfile>) {
  const after = { ...before, ...changes };
  const changedFields = editableProfileFields.filter(field => before[field] !== after[field]);
  return { after, changedFields };
}

export function profileHash(profile: EditableProfile) {
  return createHash("sha256").update(JSON.stringify(editableProfileFields.map(field => profile[field]))).digest("hex");
}

export function draftRequestHash(reviewId: number, draft: DraftSave) {
  const pairs = editableProfileFields.filter(field => field in draft.changes)
    .map(field => [field, draft.changes[field]]);
  return createHash("sha256").update(JSON.stringify([reviewId, draft.expectedVersion, pairs])).digest("hex");
}
