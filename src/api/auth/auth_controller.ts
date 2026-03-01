import { Response, Request } from "express";
import * as authService from "./auth_service";

const is_secure = process.env.COOKIE_SECURE === "true";

interface StudentRequest extends Request {
    user?: {
        student_number: string;
    }
}

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
            secure: is_secure,
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

export async function handleUpdatePassById(req: StudentRequest, res: Response) {
    const student_number = req.user?.student_number;
    const pass = req.body?.new_pass;

    if (!student_number || !pass) {
        return res.status(404).json({ error: "Invalid request!" });
    }

    const result = await authService.updatePassById(student_number, pass);
    if (!result.success) {
        return res.status(401).json({ error: result.reason });
    }

    return res.status(200).json({
        status: "ok"
    });
}

export async function handleLogout(req: Request, res: Response) {
    res.clearCookie("token", {
        httpOnly: true,
        secure: is_secure,
        sameSite: 'lax',
        path: '/'
    });

    res.status(200).json({
        status: "ok"
    });
}