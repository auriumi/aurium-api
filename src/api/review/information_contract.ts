import { ReviewStage } from "@prisma/client";
import type { Cycle } from "./rac_contract";

export const informationQueues = [
  "ALL", "PENDING", "SUBMITTED_QC", "REJECTED_QC", "APPROVED_QC",
  "SUBMITTED_MODERATOR", "COMPLETED", "REJECTED_MODERATOR",
] as const;
export type InformationQueue = typeof informationQueues[number];

export type InformationListQuery = Cycle & {
  page: number;
  queue: InformationQueue;
  department: string | null;
  course: string | null;
  major: string | null;
  search: string;
};

export function stagesForQueue(queue: Exclude<InformationQueue, "ALL">): ReviewStage[] {
  if (queue === "PENDING") return [ReviewStage.DRAFT];
  if (queue === "COMPLETED") return [ReviewStage.LOCKED];
  if (queue === "APPROVED_QC") return [ReviewStage.APPROVED_QC, ReviewStage.SUBMITTED_MODERATOR];
  return [queue as ReviewStage];
}

export function queueForStage(stage: ReviewStage): Exclude<InformationQueue, "ALL"> {
  if (stage === ReviewStage.DRAFT) return "PENDING";
  if (stage === ReviewStage.LOCKED) return "COMPLETED";
  if (stage === ReviewStage.SUBMITTED_MODERATOR) return "APPROVED_QC";
  return stage as Exclude<InformationQueue, "ALL">;
}
