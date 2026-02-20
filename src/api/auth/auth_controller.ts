import { Response, Request } from "express";
import * as authService from "./auth_service";

export async function handleLogin(req: Request, res: Response) {
    const { id, pass, is_admin } = req.body;

    if (!id || !pass) {
        return res.status(401).json({
            error: "Missing login details"
        });
    }

    try {
        const result = await authService.handleLogin(id, pass, is_admin);

        if (!result.success) {
            return res.status(401).json(result.reason);
        }

        const token = await authService.jwtGen({
            [is_admin ? 'admin_email' : 'student_number']: id,
            is_admin: is_admin,
        });

        res.cookie("token", token, {
            httpOnly: true,
            secure: false, //must be true in prod
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60,
            path: '/'
        });

        res.json({
            status: "Logged in!"
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Internal Server Error"
        });
    }
}

export async function handleLogout(req: Request, res: Response) {
    res.clearCookie("token", {
        httpOnly: true,
        secure: false, //must be true in prod
        sameSite: 'lax',
        path: '/'
    });

    res.status(200).json({
        status: "ok"
    });
}