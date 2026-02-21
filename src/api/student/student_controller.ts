import { Request, Response } from "express";
import * as studentService from "./student_service";

//create student upon registration
export async function studentRegistration(req: Request, res: Response) {
    try {
        const body = req.body;
        console.log(body);

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

export async function fetchBooking(req: Request, res: Response) {
    const list_booking = await studentService.fetchBooking();
    return res.json(list_booking);
}

/* TODO:
export async function createBooking(req: Request, res: Response) {
    try {
        const { student_number, boooking_id, period } = req.body;

        if (!student_number || !boooking_id || !period) {
            return res.status(400).json({
                error: "Invalid Request!",
            })
        }

        if (period !== 'morning' && period !== 'afternoon') {
            return res.status(400).json({
                error: "Invalid Request!",
            })
        }

        await studentService.createBooking(student_number, boooking_id, period);

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
}
*/