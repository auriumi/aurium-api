import "dotenv/config";

export const frontendOrigin = process.env.NODE_ENV === "production"
  ? "https://aurium-yearbook.site"
  : "http://localhost:3000";
