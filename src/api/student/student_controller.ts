import { Request, Response } from "express";
import * as studentService from "./student_serivce";

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
        res.status(500).json({
            status: "Error",
            message: "Server error nyae",
        });
    }
}

//fetch for unverified students
export async function fetchUnverifiedStudents(req: Request, res: Response) {
  const unverifiedStudentsList = await studentService.fetchUnverifiedStudents();
  res.json(unverifiedStudentsList);
};