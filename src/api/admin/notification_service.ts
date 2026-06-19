import prisma from "../../config/prisma";
import { AdminRoles, NotificationType } from "@prisma/client";

const NOTIFS_PER_PAGE = 15;

// approvers = all ADMINISTRATORs + MODERATORs flagged can_approve_images
const APPROVER_WHERE = {
  OR: [
    { role: AdminRoles.ADMINISTRATOR },
    { role: AdminRoles.MODERATOR, can_approve_images: true },
  ],
};

async function getApproverIds(excludeId?: number): Promise<number[]> {
  const approvers = await prisma.admin.findMany({
    where: APPROVER_WHERE,
    select: { id: true },
  });
  return approvers.map((a) => a.id).filter((id) => id !== excludeId);
}

// fan-out to every approver (used on new upload)
export async function notifyApprovers(
  type: NotificationType,
  message: string,
  image_id: number,
  exclude_admin_id?: number
) {
  const ids = await getApproverIds(exclude_admin_id);
  if (!ids.length) return;
  await prisma.notification.createMany({
    data: ids.map((id) => ({ recipient_id: id, type, message, image_id })),
  });
}

// single recipient (used on approve/reject -> uploader)
export async function notifyUser(
  recipient_id: number,
  type: NotificationType,
  message: string,
  image_id: number
) {
  await prisma.notification.create({
    data: { recipient_id, type, message, image_id },
  });
}

// thread participants = approvers ∪ uploader − author (used on new comment)
export async function notifyParticipants(
  image: { id: number; uploaded_by: number },
  type: NotificationType,
  message: string,
  author_id: number
) {
  const ids = new Set(await getApproverIds());
  ids.add(image.uploaded_by);
  ids.delete(author_id);
  const list = [...ids];
  if (!list.length) return;
  await prisma.notification.createMany({
    data: list.map((id) => ({ recipient_id: id, type, message, image_id: image.id })),
  });
}

export async function listNotifications(admin_id: number, page: number, unreadOnly: boolean) {
  const where: any = { recipient_id: admin_id };
  if (unreadOnly) where.is_read = false;

  const skip = (Math.max(1, page) - 1) * NOTIFS_PER_PAGE;

  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: NOTIFS_PER_PAGE,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { recipient_id: admin_id, is_read: false } }),
  ]);

  return { items, total, unread, per_page: NOTIFS_PER_PAGE };
}

export async function countUnread(admin_id: number) {
  return prisma.notification.count({
    where: { recipient_id: admin_id, is_read: false },
  });
}

// only marks rows owned by the caller (scoped by recipient_id)
export async function markRead(admin_id: number, notif_id: number) {
  const result = await prisma.notification.updateMany({
    where: { id: notif_id, recipient_id: admin_id },
    data: { is_read: true },
  });
  return result.count > 0;
}

export async function markAllRead(admin_id: number) {
  await prisma.notification.updateMany({
    where: { recipient_id: admin_id, is_read: false },
    data: { is_read: true },
  });
  return true;
}
