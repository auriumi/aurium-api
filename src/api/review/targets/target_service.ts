import { Prisma } from "@prisma/client";
import prisma from "../../../config/prisma";
import { Cycle } from "../rac/rac_contract";
import { managerCapabilities } from "../assignments/staff_assignment_service";
import { ReviewRequestError } from "../shared/review_error";
import { manilaDate, progressForDate, targetHash, TargetBatch, TargetRole } from "./target_contract";

const activeAssignment = (role: TargetRole) => ({ capability: role, revoked_at: null });
const day = (value: Date) => value.toISOString().slice(0, 10);

export async function saveTargets(actorId: number, batch: TargetBatch) {
  const role = batch.role ?? "INFORMATION_PROOFREADER";
  const hash = targetHash(batch);
  return prisma.$transaction(async tx => {
    // Shared with assignment grants/revocations so authority cannot disappear mid-write.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(4282608)::text`;
    await tx.$queryRaw`SELECT id FROM "Admin" WHERE id = ${actorId} FOR UPDATE`;
    await managerCapabilities(actorId, tx);
    const prior = await tx.reviewOperation.findUnique({ where: { actor_id_client_key: { actor_id: actorId, client_key: batch.operationId } } });
    if (prior) {
      if (prior.request_hash !== hash) throw new ReviewRequestError(409, "OPERATION_REUSED", "This request ID was used for a different action.");
      if (!prior.response) throw new ReviewRequestError(409, "OPERATION_INCOMPLETE", "Refresh before trying again.");
      return prior.response;
    }
    const today = manilaDate();
    const lastDay = day(new Date(Date.parse(today) + 365 * 86400000));
    if (batch.entries.some(r => r.date < today || r.date > lastDay)) {
      throw new ReviewRequestError(400, "INVALID_DATE", "Set targets for today or the next 365 days. Past targets are read-only.");
    }
    const staffIds = [...new Set(batch.entries.map(r => r.staffId))];
    const eligible = await tx.admin.count({ where: { id: { in: staffIds }, reviewAssignments: { some: activeAssignment(role) } } });
    if (eligible !== staffIds.length) throw new ReviewRequestError(409, "ASSIGNMENT_CHANGED", "Every selected staff member must have an active assignment for the selected role. Refresh the list.");
    const existing = await tx.proofreadingDailyTarget.findMany({ where: { staff_id: { in: staffIds },
      grad_year: batch.year, grad_term: batch.term, capability: role, target_date: { in: [...new Set(batch.entries.map(r => r.date))].map(d => new Date(d)) } } });
    const lookup = new Map(existing.map(r => [`${r.staff_id}/${day(r.target_date)}`, r]));
    for (const edit of batch.entries) {
      const previous = lookup.get(`${edit.staffId}/${edit.date}`);
      if ((previous?.version ?? null) !== edit.expectedVersion) throw new ReviewRequestError(409, "STALE_TARGET", "A target changed. Refresh and review the current values before saving.");
      if (previous && previous.target_count !== edit.count && !batch.reason) throw new ReviewRequestError(400, "REASON_REQUIRED", "Give a reason when changing an existing target.");
    }
    const operation = await tx.reviewOperation.create({ data: { actor_id: actorId, client_key: batch.operationId, request_hash: hash } });
    const saved = [];
    for (const edit of batch.entries) {
      const previous = lookup.get(`${edit.staffId}/${edit.date}`);
      if (previous?.target_count === edit.count) { saved.push({ id: previous.id, version: previous.version }); continue; }
      const target = previous
        ? await tx.proofreadingDailyTarget.update({ where: { id: previous.id }, data: { target_count: edit.count, version: { increment: 1 } } })
        : await tx.proofreadingDailyTarget.create({ data: { staff_id: edit.staffId, grad_year: batch.year, grad_term: batch.term, capability: role,
          target_date: new Date(edit.date), target_count: edit.count } });
      await tx.proofreadingTargetChange.create({ data: { target_id: target.id, changed_by: actorId, previous_count: previous?.target_count ?? null,
        new_count: edit.count, reason: batch.reason, operation_id: operation.id } });
      saved.push({ id: target.id, version: target.version });
    }
    const response = { success: true, saved };
    await tx.reviewOperation.update({ where: { id: operation.id }, data: { response } });
    return response;
  }, { maxWait: 5000, timeout: 15000 });
}

// Select the first qualifying role action over the ENTIRE track history before filtering
// actor/date. Rejections, reassignment and reopening must never earn a second credit.
async function staffProgress(staffIds: number[], cycle: Cycle, date: string, role: TargetRole = "INFORMATION_PROOFREADER") {
  if (!staffIds.length) return [];
  const targets = await prisma.proofreadingDailyTarget.findMany({ where: { staff_id: { in: staffIds },
    grad_year: cycle.year, grad_term: cycle.term, capability: role, target_date: { lte: new Date(date) } }, orderBy: { target_date: "asc" } });
  // Fixed SQL fragments only: never interpolate request text into SQL identifiers.
  const information = role === "INFORMATION_PROOFREADER" || role === "INFORMATION_QC" || role === "FINAL_MODERATOR";
  const photos = role === "PHOTO_UPLOADER" || role === "PHOTO_QC" || role === "FINAL_MODERATOR";
  const actionFilter = role === "FINAL_MODERATOR" ? Prisma.sql`e.action IN ('LOCKED', 'REJECTED_MODERATOR')`
    : role === "INFORMATION_QC" || role === "PHOTO_QC" ? Prisma.sql`e.action IN ('APPROVED_QC', 'REJECTED_QC')`
    : Prisma.sql`e.action = 'SUBMITTED_QC'`;
  const counts = await prisma.$queryRaw<{ actor_id: number; date: string; count: number }[]>`
    WITH eligible_events AS (
      SELECT e.id, e.track_id, e.actor_id, e.created_at FROM "InformationReviewEvent" e
      JOIN "ReviewTrack" t ON t.id = e.track_id JOIN "ReviewCase" c ON c.id = t.case_id
      WHERE ${information} AND t.type = 'INFORMATION' AND ${actionFilter}
        AND c.grad_year = ${cycle.year} AND c.grad_term = ${cycle.term}::"GraduationTerm"
      UNION ALL
      SELECT e.id, e.track_id, e.actor_id, e.created_at FROM "PhotoReviewEvent" e
      JOIN "ReviewTrack" t ON t.id = e.track_id JOIN "ReviewCase" c ON c.id = t.case_id
      WHERE ${photos} AND t.type = 'PHOTOS' AND ${actionFilter}
        AND c.grad_year = ${cycle.year} AND c.grad_term = ${cycle.term}::"GraduationTerm"
    ), first_work AS (
      SELECT DISTINCT ON (track_id) track_id, actor_id, created_at FROM eligible_events
      ORDER BY track_id, created_at, id
    )
    SELECT actor_id, to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS date,
      count(*)::int AS count
    FROM first_work WHERE actor_id IN (${Prisma.join(staffIds)})
      AND created_at < (${date}::date + interval '1 day' - interval '8 hours')
    GROUP BY actor_id, date`;
  return staffIds.map(staffId => {
    const own = targets.filter(r => r.staff_id === staffId);
    const current = own.find(r => day(r.target_date) === date);
    return { staffId, role, targetId: current?.id ?? null, version: current?.version ?? null,
      ...progressForDate(own.map(r => ({ date: day(r.target_date), count: r.target_count })),
        counts.filter(r => r.actor_id === staffId), date) };
  });
}

export async function myProgress(actorId: number, cycle: Cycle, date: string, role: TargetRole = "INFORMATION_PROOFREADER") {
  if (!await prisma.reviewAssignment.findFirst({ where: { admin_id: actorId, ...activeAssignment(role) } })) {
    throw new ReviewRequestError(403, "FORBIDDEN", "An active assignment for the selected role is required.");
  }
  return { success: true, today: manilaDate(), progress: (await staffProgress([actorId], cycle, date, role))[0] };
}

export async function listTargets(actorId: number, cycle: Cycle, date: string, page: number, search: string, department: string, role: TargetRole = "INFORMATION_PROOFREADER") {
  await managerCapabilities(actorId);
  const where: Prisma.AdminWhereInput = { AND: [
    { OR: [{ reviewAssignments: { some: activeAssignment(role) } }, { proofreadingTargets: { some: { grad_year: cycle.year, grad_term: cycle.term, capability: role } } }] },
    ...(search ? [{ OR: [{ first_name: { contains: search, mode: "insensitive" as const } }, { last_name: { contains: search, mode: "insensitive" as const } }] }] : []),
    ...(department ? [{ reviewAssignments: { some: { capability: role,
      OR: [{ department }, { department: null }] } } }] : []),
  ] };
  const [staff, total] = await Promise.all([
    prisma.admin.findMany({ where, skip: (page - 1) * 25, take: 25, orderBy: [{ last_name: "asc" }, { first_name: "asc" }, { id: "asc" }],
      select: { id: true, first_name: true, last_name: true, reviewAssignments: { where: activeAssignment(role),
        select: { department: true, course: true, major: true } } } }),
    prisma.admin.count({ where }),
  ]);
  const progress = await staffProgress(staff.map(s => s.id), cycle, date, role);
  return { success: true, today: manilaDate(), date, page, pageSize: 25, total,
    staff: staff.map(s => ({ id: s.id, firstName: s.first_name, lastName: s.last_name,
      active: s.reviewAssignments.length > 0, assignments: s.reviewAssignments, ...progress.find(p => p.staffId === s.id)! })) };
}

export async function targetHistory(actorId: number, targetId: number, page: number) {
  await managerCapabilities(actorId);
  const target = await prisma.proofreadingDailyTarget.findUnique({ where: { id: targetId } });
  if (!target) throw new ReviewRequestError(404, "NOT_FOUND", "Target not found.");
  const where = { target_id: targetId };
  const [changes, total] = await Promise.all([
    prisma.proofreadingTargetChange.findMany({ where, orderBy: { id: "desc" }, take: 25, skip: (page - 1) * 25,
      select: { id: true, previous_count: true, new_count: true, reason: true, changed_at: true,
        actor: { select: { first_name: true, last_name: true } } } }),
    prisma.proofreadingTargetChange.count({ where }),
  ]);
  return { success: true, changes, total, page, pageSize: 25 };
}

export async function targetSchedule(actorId: number, cycle: Cycle, staffIds: number[], dates: string[], role: TargetRole = "INFORMATION_PROOFREADER") {
  await managerCapabilities(actorId);
  const targets = await prisma.proofreadingDailyTarget.findMany({ where: { staff_id: { in: staffIds },
    grad_year: cycle.year, grad_term: cycle.term, capability: role, target_date: { in: dates.map(d => new Date(d)) } } });
  return { success: true, entries: staffIds.flatMap(staffId => dates.map(date => {
    const target = targets.find(t => t.staff_id === staffId && day(t.target_date) === date);
    return { staffId, date, count: target?.target_count ?? null, expectedVersion: target?.version ?? null };
  })) };
}
