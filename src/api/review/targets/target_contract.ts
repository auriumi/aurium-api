import { createHash } from "crypto";
import { Cycle, readCycle } from "../rac/rac_contract";

export const MAX_TARGET = 10000;
export const MAX_BATCH = 100;
export const TARGET_ROLES = ["INFORMATION_PROOFREADER", "INFORMATION_QC", "PHOTO_UPLOADER", "PHOTO_QC", "FINAL_MODERATOR"] as const;
export type TargetRole = typeof TARGET_ROLES[number];
export function readTargetRole(value: unknown): TargetRole | null {
  return typeof value === "string" && TARGET_ROLES.includes(value as TargetRole) ? value as TargetRole : null;
}
export function manilaDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export type TargetEdit = { staffId: number; date: string; count: number; expectedVersion: number | null };
export type TargetBatch = Cycle & { role: TargetRole; operationId: string; reason: string; entries: TargetEdit[] };
export function readTargetBatch(input: unknown): TargetBatch | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  const cycle = readCycle(v.year, v.term);
  const role = readTargetRole(v.role ?? "INFORMATION_PROOFREADER");
  if (!cycle || !role || Object.keys(v).some(k => !["role", "year", "term", "operationId", "reason", "entries"].includes(k)) ||
      typeof v.operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.operationId) ||
      typeof v.reason !== "string" || v.reason.trim().length > 500 ||
      !Array.isArray(v.entries) || !v.entries.length || v.entries.length > MAX_BATCH) return null;
  const entries: TargetEdit[] = [];
  const keys = new Set<string>();
  for (const value of v.entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as TargetEdit;
    const key = `${row.staffId}/${row.date}`;
    if (Object.keys(row).some(k => !["staffId", "date", "count", "expectedVersion"].includes(k)) ||
        !Number.isSafeInteger(row.staffId) || row.staffId < 1 || row.staffId > 2147483647 || !validDate(row.date) ||
        !Number.isSafeInteger(row.count) || row.count < 0 || row.count > MAX_TARGET ||
        (row.expectedVersion !== null && (!Number.isSafeInteger(row.expectedVersion) || row.expectedVersion < 1)) ||
        keys.has(key)) return null;
    keys.add(key); entries.push(row);
  }
  return { ...cycle, role, operationId: v.operationId.toLowerCase(), reason: v.reason.trim(),
    entries: entries.sort((a, b) => a.staffId - b.staffId || a.date.localeCompare(b.date)) };
}
export function targetHash(batch: TargetBatch) {
  return createHash("sha256").update(JSON.stringify({ resource: "proofreading-targets", year: batch.year,
    term: batch.term, role: batch.role ?? "INFORMATION_PROOFREADER", reason: batch.reason, entries: batch.entries })).digest("hex");
}
export type DayCount = { date: string; count: number };
export function progressForDate(targets: DayCount[], submissions: DayCount[], date: string) {
  const scheduled = new Map(targets.filter(r => r.date <= date).map(r => [r.date, r.count]));
  const counts = new Map(submissions.map(r => [r.date, r.count]));
  const startDate = [...scheduled.keys()].sort()[0] ?? null;
  let carriedBacklog = 0;
  if (startDate) {
    const dates = [...new Set([...scheduled.keys(), ...counts.keys()])]
      .filter(d => d >= startDate && d < date).sort();
    for (const day of dates) carriedBacklog = Math.max(0, carriedBacklog + (scheduled.get(day) ?? 0) - (counts.get(day) ?? 0));
  }
  const target = scheduled.get(date) ?? null;
  const submitted = counts.get(date) ?? 0;
  return { date, startDate, target, carriedBacklog, submitted,
    remaining: Math.max(0, carriedBacklog + (target ?? 0) - submitted) };
}
