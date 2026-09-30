// Keep the current production bucket unless an environment selects an isolated one.
export const R2_BUCKET = process.env.R2_BUCKET?.trim() || "aurium";
