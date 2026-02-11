import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";

const jwt_sauce = process.env.JWT_SAUCE;

interface AuthRequest extends Request {
    user?: any
}

export function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: "Access Denied!" });
    }

    try {
        const body = jwt.verify(token, jwt_sauce as string);
        req.user = body;
        console.log(body);

        next();
    } catch (err) {
        return res.status(403).json({ err: "Invalid Token!" });
    }
}