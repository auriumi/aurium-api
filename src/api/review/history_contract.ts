import { ReviewRequestError } from "./review_error";

// Missing starts at the newest entry. Zero is an exhausted stream when a
// history response combines independently paged events and uploads.
export function readHistoryCursor(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,9})$/.test(value) || Number(value) > 2147483647) {
    throw new ReviewRequestError(400, "INVALID_CURSOR", "Invalid history cursor.");
  }
  return Number(value);
}
