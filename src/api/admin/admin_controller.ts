import { Request, Response } from "express";
import * as adminService from "./admin_service";

//handle verification
export async function handleVerify(req: Request, res: Response) {
  try {
    const body = req.body;
    if (!body.id) {
      return res.status(400).json({
        error: "Student ID is required!"
      });
    }

    const isVerified = await adminService.verifyStudent(body.id);
    
    if (!isVerified) {
      return res.status(404).json({
        message: "ID is not found or already verified!"
      });
    } else {

      //generate passwrod when verified
      await adminService.generatePass(body.id); 
      
      res.json({
        status: "Success!"
      });
    }

  } catch (err) {
    console.error("Error: ", err);
    res.status(500).json({
      status: "Invalid!",
    });
  }
};
