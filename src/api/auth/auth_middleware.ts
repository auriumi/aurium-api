import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";
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