import { Request, Response } from "express";
import { generatePresignedUrl } from "./r2_service";
import * as studentService from "./student_service";
import * as r2Service from "./r2_service";

interface StudentRequest extends Request {
    user?: {
        student_number: string;
    }
}

//create student upon registration
export async function studentRegistration(req: Request, res: Response) {
    try {
        const body = req.body;

        if (!body.id) {
            return res.status(400).json({
                error: "Student Number is required!",
            });
        }

        await studentService.createStudent(body);

        return res.json({
            status: "Success",
        });
    } catch (err) {
        console.error(`Error: ${err}`);
        return res.status(500).json({
            status: "Failed",
            message: "Server error nyae",
        });
    }
}

//fetch student profile
export async function getStudentById(req: StudentRequest, res: Response) {
    try {
        //get id from jwt paylaod
        const student_number = req.user?.student_number;
        if (!student_number) {
            res.status(404).json({ error: "Invalid request!"});
        }

        const result = await studentService.getStudentProfile(parseInt(student_number!));
        if (!result.success) {
            res.status(404).json({ error: result.reason });
        }
        res.json(result.student);

    } catch (err) {
        console.error("Error: ", err);
        return res.status(500).json({
            status: "Failed",
            message: "Server error nyae",
        });
    }
};

export async function fetchBooking(req: Request, res: Response) {
    const list_booking = await studentService.fetchBooking();
    return res.json(list_booking);
};

export async function createBooking(req: StudentRequest, res: Response) {
    try {
        //get id from jwt paylaod
        const student_number = req.user?.student_number;
        const { booking_id, period } = req.body;

        if (!student_number || !booking_id || !period) {
            return res.status(400).json({
                error: "Invalid Request!",
            })
        }

        if (period !== 'AM' && period !== 'PM') {
            return res.status(400).json({
                error: "Invalid Request!",
            })
        }

        await studentService.createBooking(parseInt(student_number!), booking_id, period);

        return res.json({
            status: "Success"
        });
    } catch (err) {
        console.error(`Error: ${err}`);
        return res.status(500).json({
            status: "Failed",
            message: "Server error nyae",
        });
    }
};

//R2
export async function getPhotoUploadUrl(req: StudentRequest, res: Response) {
    const student_number = req.user?.student_number;
    if (!student_number) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const ext = req.query.ext as string || "jpg";
    const mime = req.query.mime as string || "image/jpg";

    try {
        const { upload_url, photo_url } = await generatePresignedUrl(student_number, ext, mime);
        res.json({ upload_url, photo_url });
    } catch (err) {
        res.json(500).json({ error: "Something went wrong generating URL" })
    }
}

export async function savePhotoUrl(req: StudentRequest, res: Response) {
    const student_number = req.user?.student_number;
    if (!student_number) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { photo_url } = req.body;
    if (!photo_url || !photo_url.startsWith("https://")) {
        return res.status(400).json({ error: "Invalid URL" });
    }

    try {
        const result = await r2Service.uploadPhotoUrl(student_number, photo_url); 

        if (!result.success) {
            return res.status(404).json({ 
                success: false, 
                reason: result.reason 
            });
        }
        return res.json({ sucess: true });

    } catch {
        res.status(500).json({ error: "Something went wrong saving photo URL" });
    }
}