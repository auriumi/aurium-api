import { Response, Request } from "express";
import * as authService from "./auth_service";

export async function handleLogin(req: Request, res: Response) {
    const { id, pass } = req.body;

    if (!id || !pass) {
        return res.status(401).json({
            error: "Missing login details"
        });
    }

    try {
        const result = await authService.handleLogin(id, pass);

        if (typeof result === 'object') {
            return res.status(404).json(result);
        }

        if (result) {
            const token = await authService.jwtGen({ student_number: id });

            res.json({
                message: "Succefully logged in!",
                token: token
            });

        } else {
            return res.status(401).json({
                message: "Incorrect Password!"
            });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Internal Server Error"
        });
    }
}