import { Request, Response } from "express";
import * as adminService from "./admin_service";
import * as notificationService from "./notification_service";
import { Prisma } from "@prisma/client";

interface AdminRequest extends Request {
  user?: {
    admin_id: string;
    role?: string;
  }
}

export async function verifyPassword(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  const { password } = req.body;
  if (typeof password !== "string" || !password) {
    return res.status(400).json({ reason: "Password is required." });
  }

  try {
    const valid = await adminService.verifyAdminPassword(admin_id, password);
    if (!valid) return res.status(401).json({ reason: "Incorrect password." });
    return res.json({ success: true });
  } catch (err) {
    console.error("Password verify error:", err);
    return res.status(500).json({ reason: "Internal Server Error" });
  }
}

export async function handleChangePassword(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  const { current_password, new_password } = req.body;
  if (typeof current_password !== "string" || !current_password ||
      typeof new_password !== "string" || !new_password) {
    return res.status(400).json({ reason: "All fields are required." });
  }

  const passwordPolicy = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!passwordPolicy.test(new_password)) {
    return res.status(400).json({ reason: "Password must be at least 8 characters and include an uppercase letter, a number, and a symbol." });
  }

  try {
    const result = await adminService.changeAdminPassword(admin_id, current_password, new_password);
    if (!result.success) return res.status(400).json({ reason: result.reason });
    return res.json({ success: true });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ reason: "Internal Server Error" });
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
    if (err instanceof Error && err.message === 'PAST_SCHEDULE_DATE') {
      return res.status(400).json({
        status: 'failed',
        reason: 'Cannot create a schedule for a date that has already passed.'
      });
    }

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

const ALLOWED_STUDENT_COLS = new Set([
  "student_number", "first_name", "last_name", "mid_name", "nickname", "suffix",
  "department", "course", "major", "thesis_title", "school_email", "personal_email", "created_at",
]);
const ALLOWED_DETAIL_COLS = new Set([
  "birth_date", "province", "city", "barangay",
  "mothers_name", "mothers_title", "fathers_name", "fathers_title",
  "guardians_name", "guardians_title", "contact_num",
]);

export async function exportMasterlist(req: Request, res: Response) {
  try {
    const dept = String(req.query.dept ?? "ALL");
    const course = String(req.query.course ?? "ALL");
    const major = String(req.query.major ?? "ALL");
    const status = String(req.query.status ?? "ALL");

    const rawCols = String(req.query.columns ?? "");
    const cols = rawCols.split(",").map(c => c.trim()).filter(Boolean);

    const students = await adminService.m_exportAll(dept, course, major, status);

    const rows = students.map(s => {
      const row: Record<string, any> = {};
      for (const col of cols) {
        if (ALLOWED_STUDENT_COLS.has(col)) row[col] = (s as any)[col] ?? null;
        else if (ALLOWED_DETAIL_COLS.has(col)) row[col] = (s.studentDetail as any)?.[col] ?? null;
        else if (col === "status") row[col] = s.studentAuth?.status ?? null;
      }
      return row;
    });

    return res.json({ success: true, data: rows, total: rows.length });
  } catch (err) {
    console.error("Export error:", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

export async function fetchApprovedStudents(req: Request, res: Response) {
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

export async function fetchApprovedStudentsById(req: Request, res: Response) {
  const student_id = req.params.student_id; 

  if (typeof student_id !== "string" || Number.isNaN(Number(student_id))) {
    return res.status(400).json({ reason: "Invalid student ID." });
  }

  try {
    const result = await adminService.fv_queryStudentById(Number(student_id));
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
    const result = await adminService.fv_markFullyVerified(Number(id), admin_id);

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

export async function fetchStaffList(req: AdminRequest, res: Response) {
  try {
    const result = await adminService.getAdminList();
    if (!result.success) {
      return res.status(400).json({ reason: result.reason });
    }
    return res.json(result.admins);
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ status: 'Internal Server Error' });
  }
}

// ------------------------------- Image management -------------------------

const VALID_IMAGE_TYPES = new Set(["GRADUATION", "THEME"]);
const VALID_MISSING = new Set(["ALL", "GRADUATION", "THEME", "BOTH", "NONE"]);

function parseImageYear(raw: unknown): number | null {
  const y = Number(raw);
  if (!Number.isInteger(y) || y < 2024 || y > 2030) return null;
  return y;
}

//list students with their graduation/theme image status for a year
export async function fetchImageStudents(req: Request, res: Response) {
  try {
    const id = Number(req.query.id); 
    const page = Number(req.query.page ?? 1);
    const dept = String(req.query.dept ?? "ALL");
    const course = String(req.query.course ?? "ALL");
    const major = String(req.query.major ?? "ALL");
    const status = String(req.query.status ?? "ALL");

    const year = parseImageYear(req.query.year ?? new Date().getFullYear());
    if (year === null) return res.status(400).json({ reason: "Invalid year." });

    const missingRaw = String(req.query.missing ?? "ALL").toUpperCase();
    const missing = VALID_MISSING.has(missingRaw) ? missingRaw : "ALL";

    const result = await adminService.img_queryStudents(id, page, dept, course, major, status, year, missing);
    return res.json(result);
  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

//issue a presigned PUT url for a graduation/theme image upload
export async function getImageUploadUrl(req: Request, res: Response) {
  const student_number = Number(req.query.student_number);
  if (!Number.isInteger(student_number)) {
    return res.status(400).json({ reason: "Invalid student number." });
  }

  const type = String(req.query.type ?? "").toUpperCase();
  if (!VALID_IMAGE_TYPES.has(type)) {
    return res.status(400).json({ reason: "Invalid image type." });
  }

  const year = parseImageYear(req.query.year);
  if (year === null) return res.status(400).json({ reason: "Invalid year." });

  const ext = String(req.query.ext ?? "jpg");
  const mime = String(req.query.mime ?? "image/jpeg");

  try {
    const { upload_url, photo_url } = await adminService.img_getUploadUrl(
      student_number, type as "GRADUATION" | "THEME", year, ext, mime
    );
    return res.json({ upload_url, photo_url });
  } catch (err) {
    console.error("Image upload URL error:", err);
    return res.status(500).json({ reason: "Something went wrong generating URL" });
  }
}

//persist the uploaded image url (upsert per student/type/year)
export async function saveImageUrl(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  const { student_number, type, year, photo_url } = req.body ?? {};

  if (!Number.isInteger(student_number)) {
    return res.status(400).json({ reason: "Invalid student number." });
  }

  const normalizedType = String(type ?? "").toUpperCase();
  if (!VALID_IMAGE_TYPES.has(normalizedType)) {
    return res.status(400).json({ reason: "Invalid image type." });
  }

  const safeYear = parseImageYear(year);
  if (safeYear === null) return res.status(400).json({ reason: "Invalid year." });

  if (typeof photo_url !== "string" || !photo_url.startsWith("https://")) {
    return res.status(400).json({ reason: "Invalid photo URL." });
  }

  try {
    const result = await adminService.img_saveImage(
      student_number, normalizedType as "GRADUATION" | "THEME", safeYear, photo_url, Number(admin_id)
    );
    if (!result.success) return res.status(404).json({ reason: result.reason });
    return res.json({ success: true });
  } catch (err) {
    console.error("Save image error:", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

// ------------------------------- Image approval forum -------------------------

const VALID_APPROVAL_VIEWS = new Set(["PENDING", "RESOLVED", "ALL"]);

//review queue
export async function fetchImageApprovals(req: Request, res: Response) {
  try {
    const page = Number(req.query.page ?? 1);
    const viewRaw = String(req.query.view ?? "PENDING").toUpperCase();
    const view = VALID_APPROVAL_VIEWS.has(viewRaw) ? viewRaw : "PENDING";

    const type = String(req.query.type ?? "ALL").toUpperCase();
    const yearParsed = parseImageYear(req.query.year);
    const year = req.query.year ? yearParsed : null; // year optional here

    const result = await adminService.img_listApprovals(view, page, type, year);
    return res.json(result);
  } catch (err) {
    console.error("Server error: ", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

//approve / reject (approvers only)
export async function handleImageDecision(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  const image_id = Number(req.params.id);
  if (!Number.isInteger(image_id)) return res.status(400).json({ reason: "Invalid request ID." });

  const action = String(req.body?.action ?? "").toUpperCase();
  if (action !== "APPROVE" && action !== "REJECT") {
    return res.status(400).json({ reason: "Invalid action." });
  }

  const note = typeof req.body?.note === "string" ? req.body.note : undefined;

  try {
    const result = await adminService.img_decide(image_id, action, note, Number(admin_id));
    if (!result.success) return res.status(400).json({ reason: result.reason });
    return res.json({ success: true });
  } catch (err) {
    console.error("Image decision error:", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

//view a request's thread (approver or uploader)
export async function fetchImageThread(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  const image_id = Number(req.params.id);
  if (!Number.isInteger(image_id)) return res.status(400).json({ reason: "Invalid request ID." });

  try {
    const result = await adminService.img_getThread(image_id, Number(admin_id), req.user?.role);
    if (!result.success) {
      if (result.forbidden) return res.status(403).json({ reason: result.reason });
      return res.status(404).json({ reason: result.reason });
    }
    return res.json({ request: result.request, comments: result.comments });
  } catch (err) {
    console.error("Fetch thread error:", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

//add a comment to a request (approver or uploader)
export async function handleAddImageComment(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  const image_id = Number(req.params.id);
  if (!Number.isInteger(image_id)) return res.status(400).json({ reason: "Invalid request ID." });

  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body) return res.status(400).json({ reason: "Comment cannot be empty." });
  if (body.length > 2000) return res.status(400).json({ reason: "Comment is too long." });

  try {
    const result = await adminService.img_addComment(image_id, body, Number(admin_id), req.user?.role);
    if (!result.success) {
      if (result.forbidden) return res.status(403).json({ reason: result.reason });
      return res.status(404).json({ reason: result.reason });
    }
    return res.json({ success: true, comment: result.comment });
  } catch (err) {
    console.error("Add comment error:", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

// ------------------------------- Notifications (self-scoped) -------------------------

export async function fetchNotifications(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  const page = Number(req.query.page ?? 1);
  const unreadOnly = String(req.query.unreadOnly ?? "false") === "true";

  try {
    const result = await notificationService.listNotifications(Number(admin_id), page, unreadOnly);
    return res.json(result);
  } catch (err) {
    console.error("Fetch notifications error:", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

export async function fetchNotificationCount(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  try {
    const count = await notificationService.countUnread(Number(admin_id));
    return res.json({ count });
  } catch (err) {
    console.error("Notification count error:", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

export async function handleMarkNotificationRead(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  const notif_id = Number(req.params.id);
  if (!Number.isInteger(notif_id)) return res.status(400).json({ reason: "Invalid notification ID." });

  try {
    const ok = await notificationService.markRead(Number(admin_id), notif_id);
    if (!ok) return res.status(404).json({ reason: "Notification not found." });
    return res.json({ success: true });
  } catch (err) {
    console.error("Mark notification read error:", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

export async function handleMarkAllNotificationsRead(req: AdminRequest, res: Response) {
  const admin_id = req.user?.admin_id;
  if (!admin_id) return res.status(401).json({ reason: "Unauthorized" });

  try {
    await notificationService.markAllRead(Number(admin_id));
    return res.json({ success: true });
  } catch (err) {
    console.error("Mark all notifications read error:", err);
    return res.status(500).json({ status: "Internal Server Error" });
  }
}

export async function handleUpdateAdminRole(req: AdminRequest, res: Response) {
  const { id } = req.params;
  const { role } = req.body;
  const requesterId = req.user?.admin_id;

  if (typeof id !== 'string' || Number.isNaN(Number(id))) {
    return res.status(400).json({ reason: "Invalid admin ID." });
  }

  if (typeof role !== 'string' || !role) {
    return res.status(400).json({ reason: "Role is required." });
  }

  if (String(requesterId) === id) {
    return res.status(400).json({ reason: "You cannot change your own role." });
  }

  try {
    const result = await adminService.updateAdminRole(Number(id), role);
    if (!result.success) {
      return res.status(400).json({ reason: result.reason });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ status: 'Internal Server Error' });
  }
}

//toggle a moderator's image-approver flag (administrators only)
export async function handleUpdateImageApprover(req: AdminRequest, res: Response) {
  const { id } = req.params;
  const { value } = req.body;

  if (typeof id !== 'string' || Number.isNaN(Number(id))) {
    return res.status(400).json({ reason: "Invalid admin ID." });
  }

  if (typeof value !== 'boolean') {
    return res.status(400).json({ reason: "A boolean value is required." });
  }

  try {
    const result = await adminService.updateImageApprover(Number(id), value);
    if (!result.success) {
      return res.status(400).json({ reason: result.reason });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ status: 'Internal Server Error' });
  }
}