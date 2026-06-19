import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { AdminRoles } from "@prisma/client";
import prisma from "../../config/prisma";
import { Permission, PERMISSION_MATRIX } from "./permissions";

const jwt_sauce = process.env.JWT_SAUCE;

interface AuthRequest extends Request {
    user?: any
}

//verify token
export function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Access Denied!" });
    }

    try {
        const body = jwt.verify(token, jwt_sauce as string);
        req.user = body;
        next();
    } catch (err) {
        return res.status(403).json({ err: "Invalid Token!" });
    }
}

//admin guard
export function isAdmin(req: AuthRequest, res: Response, next: NextFunction) {
    if (req.user && req.user.is_admin) {
        next();
    } else {
        return res.status(403).json({
            error: "Forbidden!"
        });
    }
}

//role-aware guard factory
export function requirePermission(permission: Permission) {
    const guard = (req: AuthRequest, res: Response, next: NextFunction) => {
        const role = req.user?.role;
        if (role && PERMISSION_MATRIX[permission].includes(role)) {
            return next();
        }
        return res.status(403).json({
            error: "Forbidden! You do not have permission to perform this action."
        });
    };

    //route marker read by assertRoutesGuarded()
    (guard as unknown as { __permission: Permission }).__permission = permission;
    return guard;
}

//image-approver guard — ADMINISTRATOR always; MODERATOR only if flagged.
//runs after requirePermission(IMAGE_APPROVE), so the route audit marker is already present.
//reads can_approve_images fresh from the DB so toggling takes effect without re-login.
export async function requireImageApprover(req: AuthRequest, res: Response, next: NextFunction) {
    try {
        const role = req.user?.role;
        const admin_id = req.user?.admin_id;

        if (role === AdminRoles.ADMINISTRATOR) return next();

        if (role === AdminRoles.MODERATOR && admin_id) {
            const admin = await prisma.admin.findUnique({
                where: { id: Number(admin_id) },
                select: { can_approve_images: true },
            });
            if (admin?.can_approve_images) return next();
        }

        return res.status(403).json({
            error: "Forbidden! You are not an image approver."
        });
    } catch (err) {
        console.error("requireImageApprover error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}