import { Request, Response, NextFunction } from "express";
import { frontendOrigin } from "../../config/frontend_origin";

// SameSite cookies and CORS do not replace a check on cookie-authenticated writes.
export function requireReviewOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.get("Origin") === frontendOrigin) return next();
  return res.status(403).json({
    success: false, code: "UNTRUSTED_ORIGIN", reason: "This review request must come from the Aurium app.",
  });
}
