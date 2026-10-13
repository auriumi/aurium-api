import { createHash } from "node:crypto";

const operationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CorrectionRequestInput = { expectedVersion: number; operationId: string; reason: string };
export type CorrectionDecisionInput = { expectedVersion: number; operationId: string;
  decision: "APPROVE" | "REJECT"; reason: string | null };

function record(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function validVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
}

function validReason(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() &&
    value.length >= 1 && value.length <= 2000 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function readCorrectionRequest(input: unknown): CorrectionRequestInput | null {
  const value = record(input);
  if (!value || Object.keys(value).some(key => !["expectedVersion", "operationId", "reason"].includes(key)) ||
      !validVersion(value.expectedVersion) || typeof value.operationId !== "string" ||
      !operationPattern.test(value.operationId) || !validReason(value.reason)) return null;
  return { expectedVersion: value.expectedVersion, operationId: value.operationId.toLowerCase(), reason: value.reason };
}

export function readCorrectionDecision(input: unknown): CorrectionDecisionInput | null {
  const value = record(input);
  if (!value || Object.keys(value).some(key => !["expectedVersion", "operationId", "decision", "reason"].includes(key)) ||
      !validVersion(value.expectedVersion) || typeof value.operationId !== "string" ||
      !operationPattern.test(value.operationId) || (value.decision !== "APPROVE" && value.decision !== "REJECT")) return null;
  const reason = value.reason === undefined || value.reason === null ? null : value.reason;
  if ((value.decision === "REJECT" && !validReason(reason)) ||
      (value.decision === "APPROVE" && reason !== null)) return null;
  return { expectedVersion: value.expectedVersion, operationId: value.operationId.toLowerCase(),
    decision: value.decision, reason: reason as string | null };
}

export function correctionHash(parts: readonly (string | number | null)[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function requiresMakerChange(status: string | null | undefined,
  reopenedVersion: number | null | undefined, revisionVersion: number | null | undefined) {
  return status === "APPROVED" && reopenedVersion !== null && reopenedVersion !== undefined &&
    revisionVersion !== null && revisionVersion !== undefined && revisionVersion <= reopenedVersion;
}
