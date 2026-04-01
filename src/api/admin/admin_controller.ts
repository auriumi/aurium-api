import { Request, Response } from "express";
import * as adminService from "./admin_service";
import { Prisma } from "@prisma/client";

interface AdminRequest extends Request {
  user?: {
    admin_id: string;
  }
}

export async function getStaffDetails(req: AdminRequest, res: Response) {
  try {
    const id = req.user?.admin_id;
    if (!id) {
      return res.status(401).json({
        error: "Unauthorized!"
      });
    } 

    const data = await adminService.getStaffProfile(id);
    if (!data.success) {
      return res.status(401).json(data.reason);
    }
    return res.json(data.staff);

  } catch (err) {
    console.error("Error: ", err);
    res.status(500).json({
      status: 'Internal Server Error'
    });
  }
} 

//handle verification
export async function handleVerify(req: AdminRequest, res: Response) {
  try {
    const { id } = req.params;
    const admin_id = req.user?.admin_id;

    if (!admin_id) {
      return res.status(401).json({
        error: "Unauthorized!"
      });
    } 

    if (typeof id !== 'string') {
      return res.status(400).json({
        error: "Student ID is required!"
      });
    }

    const result = await adminService.verifyStudent(id, admin_id);
    
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

    const result = await adminService.deleteStudent(id);
    
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
    const { id } = req.params;
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

export async function handleToggleScheduleState(req: AdminRequest, res: Response) {
  const booking_id = req.query.id; 
  if (!booking_id) return res.status(400).json({ error: 'No id provided!' });

  try {
    const result = await adminService.toggleScheduleState(Number(booking_id));
    if (!result.success) res.status(404).json({ reason: result.reason });

    return res.json({ status: 'success' });

  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({
      status: 'Internal Server Error'
    });
  }
}

export async function handleUpdateScheduleCapacity(req: AdminRequest, res: Response) {
  const booking_id = req.query.id;
  const { session, new_cap } = req.body ?? {};

  if (typeof booking_id !== "string" || Number.isNaN(Number(booking_id))) {
    return res.status(400).json({ reason: "Invalid booking ID." });
  }

  if (session !== "AM" && session !== "PM") {
    return res.status(400).json({ reason: "Invalid session. Use AM or PM." });
  }

  if (!Number.isInteger(new_cap) || new_cap < 0) {
    return res.status(400).json({ reason: "Invalid capacity." });
  }

  try {
    const result = await adminService.updateScheduleCapacity(Number(booking_id), session, new_cap);
    if (!result.success) {
      return res.status(404).json({ reason: result.reason });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({
      status: "Internal Server Error"
    });
  }
}

//fetch students based on filter type
export async function fetchMasterlist(req: Request, res: Response) {
  const id = req.query.id;
  if (id) return fetchMasterlistById(req, res, Number(id));

  try {
    const page = Number(req.query.page ?? 1);
    const dept = String(req.query.dept ?? "ALL");
    const course = String(req.query.course ?? "ALL");
    const major = String(req.query.major ?? "ALL");
    const status = String(req.query.status ?? "ALL");

    const result = await adminService.m_queryByFilter(page, dept, course, major, status);
    return res.json(result);

  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({
      status: 'Internal Server Error'
    });
  }
}

export async function fetchAttendedStudents(req: Request, res: Response) {
  const page = Number(req.query.page ?? 1);
  
   try {
    const result = await adminService.fv_queryStudents(page);
    return res.json(result);

   } catch (err) {
     console.error("Server error: ", err);
     return res.status(500).json({
       status: 'Internal Server Error'
     });
   }
}

export async function handleFinalizeStudentUpdate(req: AdminRequest, res: Response) {
  const { studentId } = req.params;
  const { type } = req.query;

  if (typeof studentId !== "string" || Number.isNaN(Number(studentId))) {
    return res.status(400).json({ reason: "Invalid student ID." });
  }

  if (typeof type !== "string") {
    return res.status(400).json({ reason: "Invalid update type." });
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ reason: "Invalid request body." });
  }

  try {
    const result = await adminService.fv_updateStudent(Number(studentId), type, req.body);

    if (!result.success) {
      return res.status(400).json({ reason: result.reason });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({
      status: "Internal Server Error"
    });
  }
}

export async function handleFinalizeStudentStatus(req: AdminRequest, res: Response) {
  const { id } = req.query;
  const admin_id = req.user?.admin_id;

  if (!admin_id) {
    return res.status(401).json({
      error: "Unauthorized!"
    });
  }

  if (typeof id !== "string" || Number.isNaN(Number(id))) {
    return res.status(400).json({ reason: "Invalid student ID." });
  }

  try {
    const result = await adminService.fv_markFullyVerified(Number(id), Number(admin_id));

    if (!result.success) {
      return res.status(400).json({ reason: result.reason });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({
      status: "Internal Server Error"
    });
  }
}

export async function handleFinalizeStudentAttended(req: AdminRequest, res: Response) {
  const { id } = req.query;

  if (typeof id !== "string" || Number.isNaN(Number(id))) {
    return res.status(400).json({ reason: "Invalid student ID." });
  }

  try {
    const result = await adminService.fv_markAttended(Number(id));

    if (!result.success) {
      return res.status(400).json({ reason: result.reason });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({
      status: "Internal Server Error"
    });
  }
}

export async function fetchAttendanceQueueList(req: AdminRequest, res: Response) {
  try {
    const attendance_list = await adminService.fv_fetchAttendanceQueue();
    return res.json(attendance_list);
  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({
      status: "Internal Server Error"
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

export async function handleStudentPasswordReset(req: AdminRequest, res: Response) {
  const { id } = req.params;
  if (typeof id !== 'string') {
    return res.status(400).json({
      error: "Bad Student ID format!"
    });
  }

  const { target } = req.body;
  if (!target) {
    return res.status(401).json({
      error: "No target email provided!"
    });
  } 

  const result = await adminService.resetStudentPass(id, target);
  if (!result.success) {
    return res.status(400).json({
      error: result.reason
    });
  }

  res.json({ status: 'success' });
}