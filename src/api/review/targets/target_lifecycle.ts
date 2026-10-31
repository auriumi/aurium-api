import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { manilaDate, readTargetRole } from "./target_contract";

// Called under the assignment-management lock. Cancels only the removed role's
// future targets after its last assignment is revoked; history remains intact.
export async function cancelFutureTargets(tx: Prisma.TransactionClient, staffId: number, actorId: number, capability: string = "INFORMATION_PROOFREADER") {
  const role = readTargetRole(capability);
  if (!role) return;
  if (await tx.reviewAssignment.count({ where: { admin_id: staffId, capability: role, revoked_at: null } })) return;
  const targets = await tx.proofreadingDailyTarget.findMany({ where: {
    staff_id: staffId, capability: role, target_date: { gt: new Date(manilaDate()) }, target_count: { gt: 0 },
  }, orderBy: { id: "asc" } });
  if (!targets.length) return;
  const operation = await tx.reviewOperation.create({ data: {
    actor_id: actorId, client_key: randomUUID(), request_hash: createHash("sha256")
      .update(JSON.stringify({ action: "cancel-future-targets-on-revocation", staffId, targets: targets.map(t => t.id) })).digest("hex"),
    response: { success: true },
  } });
  for (const target of targets) {
    await tx.proofreadingDailyTarget.update({ where: { id: target.id }, data: { target_count: 0, version: { increment: 1 } } });
    await tx.proofreadingTargetChange.create({ data: { target_id: target.id, changed_by: actorId,
      previous_count: target.target_count, new_count: 0, reason: `Last ${role} assignment removed.`, operation_id: operation.id } });
  }
}
