import "dotenv/config";

export function resolveFrontendOrigin(configured: string | undefined, nodeEnv: string | undefined): string {
  if (!configured) return nodeEnv === "production" ? "https://aurium-yearbook.site" : "http://localhost:3000";
  const value = configured.trim();
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("FRONTEND_ORIGIN must be one exact browser origin"); }
  const localHttp = nodeEnv !== "production" && url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (value !== url.origin || (url.protocol !== "https:" && !localHttp)) {
    throw new Error("FRONTEND_ORIGIN must be one exact HTTPS origin (or local HTTP in development)");
  }
  return url.origin;
}

export const frontendOrigin = resolveFrontendOrigin(process.env.FRONTEND_ORIGIN, process.env.NODE_ENV);
