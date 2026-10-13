import { createHash } from "crypto";
import { GraduationTerm, RacOutcome } from "@prisma/client";

export type VerificationStatus = "ALL" | "UNCHECKED" | RacOutcome;

export type Cycle = { year: number; term: GraduationTerm };

export type VerificationBatch = Cycle & {
  studentNumbers: number[];
  outcome: RacOutcome;
  expectedVersions: Record<string, number | null>;
  sourceVersion: string;
  operationId: string;
};

export function readCycle(year: unknown, term: unknown): Cycle | null {
  if (!Number.isSafeInteger(Number(year)) || Number(year) < 2000 || Number(year) > 2100 ||
      typeof term !== "string" || !Object.values(GraduationTerm).includes(term as GraduationTerm)) return null;
  return { year: Number(year), term: term as GraduationTerm };
}

export function readVerificationBatch(input: unknown): VerificationBatch | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const allowedKeys = ["year", "term", "studentNumbers", "outcome", "expectedVersions", "sourceVersion", "operationId"];
  if (Object.keys(value).some(key => !allowedKeys.includes(key))) return null;
  const cycle = readCycle(value.year, value.term);
  if (!cycle || !Array.isArray(value.studentNumbers) ||
      value.studentNumbers.length === 0 || value.studentNumbers.length > 100 ||
      value.studentNumbers.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647) ||
      new Set(value.studentNumbers).size !== value.studentNumbers.length ||
      !Object.values(RacOutcome).includes(value.outcome as RacOutcome) ||
      typeof value.sourceVersion !== "string" || !value.sourceVersion.trim() ||
      value.sourceVersion !== value.sourceVersion.trim() || value.sourceVersion.length > 100 ||
      typeof value.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationId) ||
      !value.expectedVersions || typeof value.expectedVersions !== "object" || Array.isArray(value.expectedVersions)) return null;

  const expectedVersions = value.expectedVersions as Record<string, unknown>;
  const ids = value.studentNumbers as number[];
  if (Object.keys(expectedVersions).length !== ids.length || ids.some(id => {
    const version = expectedVersions[String(id)];
    return version !== null && (!Number.isSafeInteger(version) || Number(version) < 1);
  })) return null;

  return {
    ...cycle,
    studentNumbers: ids,
    outcome: value.outcome as RacOutcome,
    expectedVersions: expectedVersions as Record<string, number | null>,
    sourceVersion: value.sourceVersion,
    operationId: value.operationId.toLowerCase(),
  };
}

export function verificationRequestHash(batch: VerificationBatch) {
  const sorted = [...batch.studentNumbers].sort((a, b) => a - b);
  const canonical = {
    year: batch.year, term: batch.term, outcome: batch.outcome, sourceVersion: batch.sourceVersion,
    records: sorted.map(studentNumber => [studentNumber, batch.expectedVersions[String(studentNumber)]]),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function canAdvanceVerification(
  current: { outcome: RacOutcome; version: number } | null,
  expectedVersion: number | null,
  nextOutcome: RacOutcome,
) {
  return (current?.version ?? null) === expectedVersion &&
    current?.outcome !== RacOutcome.VERIFIED &&
    !(current?.outcome === RacOutcome.NOT_LISTED && nextOutcome === RacOutcome.NOT_LISTED);
}
