import { Response, Request } from "express";
import * as authService from "./auth_service";

export async function handleLogin(req: Request, res: Response) {
    const body = req.body;
    const id = body.id;
    const pass = body.pass;

    try {
        const result = await authService.handleLogin(id, pass);

        if (typeof result === 'object') {
            return res.status(404).json(result);
        }

        if (!result) {
            return res.status(401).json({
                message: "Incorrect Password!"
            });
        }

        res.json({
            message: "Succefully logged in!"
        })

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            message: "Internal Server Error"
        });
    }
}