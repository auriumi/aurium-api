import { Request, Response } from "express";
import * as studentService from "./student_service";

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