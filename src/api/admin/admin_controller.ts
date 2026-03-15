import { Request, Response } from "express";
import * as adminService from "./admin_service";
import { Prisma } from "@prisma/client";

interface AdminRequest extends Request {
  user?: {
    admin_id: string;
  }
}

//handle verification
export async function handleVerify(req: AdminRequest, res: Response) {
  try {
    const body = req.body;
    const admin_id = req.user?.admin_id;

    if (!admin_id) {
      return res.status(401).json({
        error: "Unauthorized!"
      });
    } 

    if (!body.id) {
      return res.status(400).json({
        error: "Student ID is required!"
      });
    }

    const result = await adminService.verifyStudent(body.id, admin_id);
    
    if (!result.success) {
      return res.status(404).json({
        message: result.reason
      });
    }

    res.json({
      status: "Success!"
    });

  } catch (err) {
    console.error("Error: ", err);
    res.status(500).json({
      status: 'Internal Server Error'
    });
  }
};

//reject student approval
export async function handleCancel(req: AdminRequest, res: Response) {
  try {
    const { id } = req.params;
    if (typeof id !== 'string') {
      return res.status(400).json({
        error: "Bad Student ID format!"
      });
    }

    const admin_id = req.user?.admin_id;
    if (!admin_id) {
      return res.status(401).json({
        error: "Unauthorized!"
      });
    } 

    const result = await adminService.deleteStudent(id, admin_id);
    
    if (!result.success) {
      return res.status(404).json({
        message: result.reason
      });
    }

    res.json({
      status: "Success!"
    });

  } catch (err) {
    console.error("Error: ", err);
    res.status(500).json({
      status: 'Internal Server Error'
    });
  }
}

//fetch for unverified students
export async function fetchUnverifiedStudents(req: Request, res: Response) {
  try {
    const { page } = req.query;
    if (!page) res.status(400).json({ error: 'Invalid request' });

    const total = await adminService.getUnverifiedStudentCount();
    const student_list = await adminService.gethUnverifiedStudents(Number(page));

    res.json({
      total,
      student_list
    });
  } catch (err) {
    console.error("Error: ", err);
    res.status(500).json({
      status: 'Internal Server Error'
    });
  }
};

export async function searchUnverifiedById(req: Request, res: Response) {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Invalid request' });

    const result = await adminService.getUnverifiedStudentById(Number(id));  
    if (!result.success) res.status(404).json({ reason: result.reason });

    res.json(result.student);

  } catch (err) {
    console.error("Error: ", err);
    res.status(500).json({
      status: 'Internal Server Error'
    });
  }
}

//add schedule
export async function addSchedule(req: Request, res: Response) {
  try {
    const body = req.body;
    const success = await adminService.addSchedule(body.date, body.am_cap, body.pm_cap);

    if (!success) {
      res.status(400).json({
        status: 'failed'
      });
    } 

    res.json({
      status: 'success'
    });

  } catch(err) {
    if ( err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return res.status(409).json({
          status: 'failed',
          reason: 'A schedule for this day already exist.'
        });
      }
    }

    console.error("Server error: ", err);
    res.status(500).json({
      status: 'Internal Server Error'
    });
  }
};

//fetch schedule
export async function fetchSchedule(req: Request, res: Response) {
  const scheduleList = await adminService.fetchSchedule();
  return res.json(scheduleList);
}

//fetch students based on filter type
export async function fetchMasterlist(req: Request, res: Response) {
  const id = req.query.id;
  if (id) return fetchMasterlistById(req, res, Number(id));

  try {
    const page = Number(req.query.page ?? 1);
    const dept = String(req.query.dept ?? "ALL");
    const course = String(req.query.course ?? "ALL");
    const status = String(req.query.status ?? "ALL");

    const result = await adminService.m_queryByFilter(page, dept, course, status);
    return res.json(result);

  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({
      status: 'Internal Server Error'
    });
  }
}

export async function fetchMasterlistById(req: Request, res: Response, student_id: number) {
  try {
    const result = await adminService.m_queryById(student_id);

    if (!result.success) {
      return res.json({ error: result.reason });
    }

    return res.json(result);
  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({
      status: 'Internal Server Error'
    });
  }
}