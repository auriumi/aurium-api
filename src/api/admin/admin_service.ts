import prisma from "../../config/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from 'resend';
import { AdminActions, StudentStatus, ImageType, ImageStatus, AdminRoles, NotificationType } from "@prisma/client";
import { generateReadUrl, generateImageUploadUrl } from "../student/r2_service";
import { notifyApprovers, notifyUser, notifyParticipants } from "./notification_service";
import {
  buildBookingSlotData,
  distributePeriodSlots,
  isBookingPeriod,
  isPastUtcDate,
} from "../booking_slots";

const resend = new Resend(process.env.RESEND_API);
const DOMAIN = "auriumi.cloud";
const DATA_CORRECTION_EXPIRY_DAYS = 7;

type CorrectionFieldChange = {
  label: string;
  from: string;
  to: string;
};

const CORRECTION_FIELD_LABELS: Record<string, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  mid_name: "Middle Name",
  suffix: "Suffix",
  nickname: "Nickname",
  course: "Course",
  major: "Major",
  thesis: "Thesis / Capstone Title",
  barangay: "Barangay",
  city: "City / Municipality",
  province: "Province",
  contact_num: "Contact Number",
  school_email: "School Email",
  personal_email: "Personal Email",
  fathers_title: "Father's Title",
  fathers_name: "Father's Name",
  mothers_title: "Mother's Title",
  mothers_name: "Mother's Name",
  guardians_title: "Guardian's Title",
  guardians_name: "Guardian's Name",
};

function getDataCorrectionBaseUrl() {
  return (
    process.env.DATA_CORRECTION_BASE_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    "https://aurium-yearbook.site"
  ).replace(/\/$/, "");
}

function hashCorrectionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function formatCorrectionValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (value instanceof Date) return value.toISOString().split("T")[0] ?? "N/A";
  return String(value).trim() || "N/A";
}

function getAllowedFinalizeFields(type: FinalizeUpdateType) {
  if (type === "personal") return STUDENT_PERSONAL_FIELDS;
  if (type === "academic") return STUDENT_ACADEMIC_FIELDS;
  if (type === "contact") return STUDENT_DETAIL_CONTACT_FIELDS;
  return STUDENT_DETAIL_FAMILY_FIELDS;
}

//pagination query
const STUDENTS_PER_PAGE = 8;
const M_STUDENTS_PER_PAGE = 9;
const F_STUDENTS_PER_PAGE = 8;
const I_STUDENTS_PER_PAGE = 9;

const STATUS_MAP: Record<number, StudentStatus> = {
  1: StudentStatus.REGISTERED,
  2: StudentStatus.APPROVED,
  3: StudentStatus.BOOKED,
  4: StudentStatus.ATTENDED,
  5: StudentStatus.FULLY_VERIFIED
}

type FinalizeUpdateType = "personal" | "academic" | "contact" | "family";

const STUDENT_PERSONAL_FIELDS = new Set([
  "first_name",
  "last_name",
  "mid_name",
  "suffix",
  "nickname"
]);

const STUDENT_ACADEMIC_FIELDS = new Set([
  "course",
  "major",
  "thesis"
]);

const STUDENT_DETAIL_CONTACT_FIELDS = new Set([
  "barangay",
  "city",
  "province",
  "contact_num",
  "school_email",
  "personal_email"
]);

const STUDENT_CONTACT_EMAIL_FIELDS = new Set([
  "school_email",
  "personal_email"
]);

const STUDENT_DETAIL_FAMILY_FIELDS = new Set([
  "fathers_title",
  "fathers_name",
  "mothers_title",
  "mothers_name",
  "guardians_title",
  "guardians_name"
]);

export async function verifyAdminPassword(admin_id: string, password: string) {
  const admin = await prisma.admin.findUnique({
    where: { id: parseInt(admin_id) },
    select: { hashed_password: true },
  });
  if (!admin) return false;
  return bcrypt.compare(password, admin.hashed_password);
}

export async function changeAdminPassword(admin_id: string, current_password: string, new_password: string) {
  const admin = await prisma.admin.findUnique({
    where: { id: parseInt(admin_id) },
    select: { hashed_password: true },
  });
  if (!admin) return { success: false, reason: "Admin not found." };

  const valid = await bcrypt.compare(current_password, admin.hashed_password);
  if (!valid) return { success: false, reason: "Current password is incorrect." };

  const hashed = await bcrypt.hash(new_password, 10);
  await prisma.admin.update({
    where: { id: parseInt(admin_id) },
    data: { hashed_password: hashed },
  });

  return { success: true };
}

export async function getStaffProfile(id: string) {
  try {
    const staff = await prisma.admin.findUnique({
      where: {
        id: parseInt(id)
      },
      select: {
        first_name: true,
        last_name: true,
        email: true,
        role: true,
        can_approve_images: true
      }
    });

    if (!staff) return { success: false, reason: "Unauthorized!" };

    return { success: true, staff }
  } catch (err: any) {
    return { 
      success: false, 
      reason: "Something went wrong!"
    };
  }
}

export async function deleteStudent(id: string) {
  try {
    await prisma.student.delete({
      where: {
        student_number: parseInt(id)
      }
    });
    return { success: true };
  } catch (err: any) {
    return { 
      success: false, 
      reason: "Something went wrong!"
    };
  }
}

export async function resetStudentPass(id: string, email_target: string) {
  try {
    const student = await prisma.student.findUnique({
      where: {
        student_number: parseInt(id)
      },
      select: {
        student_number: true,
        school_email: true,
        personal_email: true
      }
    });
    if (!student) return { success: false, reason: "Student ID doesn't exist." };

    const target_email = email_target === 'personal' 
      ? student.personal_email 
      : email_target === 'school' 
      ? student.school_email 
      : null;

    if (!target_email) {
      return { success: false, reason: "Invalid target email given." };
    }

    const temp_pass = await generatePass();

    const send_pass = await sendCreds(temp_pass.actual_pass, target_email);
    if (!send_pass) {
      return { success: false, reason: "Something went wrong when sending the password." };
    }

    await prisma.studentAuth.update({
      where: {
        student_number: student.student_number
      },
      data: {
        hashed_password: temp_pass.hash_pass,
        is_new: true
      }
    });

    return { success: true };
  } catch (err) {
    console.error(`Failed to reset password for student ${id}:`, err);

    return { 
      success: false, 
      reason: "An unexpected error occurred. Please try again later." 
    };
  }
}

export async function generateLog(admin_id: number, target_id: number, action: AdminActions) {
  return await prisma.logs.create({
    data: {
      admin_id: admin_id,
      action: action,
      target_id: target_id
    }
  });
}

export async function generatePass() {
  const chars: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  const charsLength: number = chars.length;
  const passLength = 10;
  let tempPass: string = "";
  
  for (let i = 0; i < passLength; i++) {
    const randIndex = crypto.randomInt(0, charsLength);
    tempPass += chars.charAt(randIndex);
  }
  
  //hashing password with bcrypt
  const hashedPass = await bcrypt.hash(tempPass, 10);

  return {
    actual_pass: tempPass,
    hash_pass: hashedPass
  };
}

//send temporary password to their email
export async function sendCreds(pass: string, recipent: string) {
  const { error } = await resend.emails.send({
    from: `Aurium <noreply@${DOMAIN}>`,
    to: recipent,
    template: {
      id: "password-verification",
      variables: {
        TEMP_PASSWORD: pass
      },
    },
  });
  return !error;
}

async function sendDataCorrectionEmail(recipient: string, studentName: string, confirmLink: string, changes: Record<string, CorrectionFieldChange>) {
  const rows = Object.values(changes).map((change) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee;font-weight:bold;color:#444">${change.label}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;color:#78716c">${change.from}</td>
      <td style="padding:10px;border-bottom:1px solid #eee;color:#292524">${change.to}</td>
    </tr>
  `).join("");

  const textChanges = Object.values(changes)
    .map((change) => `${change.label}: ${change.from} -> ${change.to}`)
    .join("\n");

  const { error } = await resend.emails.send({
    from: `Aurium <noreply@${DOMAIN}>`,
    to: recipient,
    subject: "Please confirm your AURIUM yearbook data correction",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#292524;max-width:680px;margin:0 auto;padding:24px">
        <h2 style="color:#78350f;margin-bottom:8px">Confirm your yearbook data correction</h2>
        <p>Hello ${studentName || "graduate"},</p>
        <p>The AURIUM Yearbook Committee proposed corrections to your verified yearbook details. Please review and confirm only if everything is correct.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;border:1px solid #eee">
          <thead>
            <tr style="background:#f8f5ef">
              <th style="text-align:left;padding:10px">Field</th>
              <th style="text-align:left;padding:10px">Current</th>
              <th style="text-align:left;padding:10px">Proposed</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:28px 0">
          <a href="${confirmLink}" style="background:#7a3b1a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
            Review and Confirm
          </a>
        </p>
        <p>If you did not expect this correction, open the link and reject the request.</p>
        <p style="font-size:13px;color:#78716c;margin-top:24px">This link expires in ${DATA_CORRECTION_EXPIRY_DAYS} days.</p>
      </div>
    `,
    text: `Please confirm your AURIUM yearbook data correction:\n\n${textChanges}\n\nReview here: ${confirmLink}\n\nThis link expires in ${DATA_CORRECTION_EXPIRY_DAYS} days.`,
  });

  return !error;
}

function getCurrentCorrectionValue(student: any, key: string) {
  if (key === "thesis") return student.thesis_title;
  if (key in student) return student[key];
  if (student.studentDetail && key in student.studentDetail) return student.studentDetail[key];
  return "";
}

export async function createDataCorrectionRequest(studentId: number, type: string, data: any, adminId: string) {
  try {
    const normalizedType = String(type).toLowerCase() as FinalizeUpdateType;
    const validTypes: FinalizeUpdateType[] = ["personal", "academic", "contact", "family"];

    if (!validTypes.includes(normalizedType)) {
      return { success: false, reason: "Invalid correction type." };
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { success: false, reason: "Invalid correction request body." };
    }

    const payloadEntries = Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value ?? "").trim()] as const);

    if (payloadEntries.length === 0) {
      return { success: false, reason: "No fields to correct." };
    }

    const allowed = getAllowedFinalizeFields(normalizedType);
    const invalidFields = payloadEntries
      .map(([key]) => key)
      .filter((key) => !allowed.has(key));

    if (invalidFields.length > 0) {
      return { success: false, reason: `Invalid field(s) for ${normalizedType}: ${invalidFields.join(", ")}` };
    }

    const student = await prisma.student.findUnique({
      where: { student_number: studentId },
      include: {
        studentAuth: true,
        studentDetail: true,
      },
    });

    if (!student) {
      return { success: false, reason: "Student doesn't exist!" };
    }

    if (student.studentAuth?.status !== StudentStatus.FULLY_VERIFIED) {
      return { success: false, reason: "Correction requests are only required for fully verified students." };
    }

    const targetEmail = student.school_email || student.personal_email;
    if (!targetEmail) {
      return { success: false, reason: "Student has no email address for confirmation." };
    }

    const changes: Record<string, CorrectionFieldChange> = {};
    for (const [key, nextValue] of payloadEntries) {
      const currentValue = formatCorrectionValue(getCurrentCorrectionValue(student, key));
      const proposedValue = formatCorrectionValue(nextValue);

      if (currentValue === proposedValue) {
        continue;
      }

      changes[key] = {
        label: CORRECTION_FIELD_LABELS[key] || key,
        from: currentValue,
        to: proposedValue,
      };
    }

    if (Object.keys(changes).length === 0) {
      return { success: false, reason: "No changes detected." };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + DATA_CORRECTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const studentName = [student.first_name, student.last_name].filter(Boolean).join(" ");
    const confirmLink = `${getDataCorrectionBaseUrl()}/auth/confirm-correction?token=${rawToken}`;

    await prisma.dataCorrectionRequest.updateMany({
      where: {
        student_number: student.student_number,
        category: normalizedType,
        status: "PENDING",
      },
      data: {
        status: "EXPIRED",
      },
    });

    const request = await prisma.dataCorrectionRequest.create({
      data: {
        student_number: student.student_number,
        requested_by: Number.isNaN(Number(adminId)) ? null : Number(adminId),
        category: normalizedType,
        changes: {
          type: normalizedType,
          fields: changes,
        },
        token_hash: hashCorrectionToken(rawToken),
        expires_at: expiresAt,
      },
    });

    const sent = await sendDataCorrectionEmail(targetEmail, studentName, confirmLink, changes);
    if (!sent) {
      await prisma.dataCorrectionRequest.update({
        where: { id: request.id },
        data: { status: "EXPIRED" },
      });
      return { success: false, reason: "Correction request was created but email sending failed." };
    }

    return { success: true };
  } catch (err) {
    console.error(`Failed to create correction request for student ${studentId}:`, err);
    return { success: false, reason: "An unexpected error occurred. Please try again later." };
  }
}

function normalizeCorrectionResponse(request: any, student: any) {
  const changes = request.changes as any;
  const fields = Object.entries(changes?.fields ?? {}).map(([key, value]: [string, any]) => ({
    key,
    label: value.label || CORRECTION_FIELD_LABELS[key] || key,
    from: value.from,
    to: value.to,
  }));

  return {
    id: request.id,
    status: request.status,
    category: request.category,
    expires_at: request.expires_at,
    student_number: request.student_number,
    student_name: [student?.first_name, student?.last_name].filter(Boolean).join(" "),
    fields,
  };
}

export async function getDataCorrectionRequest(rawToken: string) {
  try {
    const request = await prisma.dataCorrectionRequest.findUnique({
      where: { token_hash: hashCorrectionToken(rawToken) },
    });

    if (!request) {
      return { success: false, reason: "Correction request not found." };
    }

    if (request.status === "PENDING" && request.expires_at.getTime() < Date.now()) {
      await prisma.dataCorrectionRequest.update({
        where: { id: request.id },
        data: { status: "EXPIRED" },
      });
      return { success: false, reason: "This correction request has expired." };
    }

    const student = await prisma.student.findUnique({
      where: { student_number: request.student_number },
      select: { first_name: true, last_name: true },
    });

    return { success: true, data: normalizeCorrectionResponse(request, student) };
  } catch (err) {
    console.error("Failed to fetch correction request:", err);
    return { success: false, reason: "Unable to load correction request." };
  }
}

export async function resolveDataCorrectionRequest(rawToken: string, decision: "confirm" | "reject") {
  try {
    const request = await prisma.dataCorrectionRequest.findUnique({
      where: { token_hash: hashCorrectionToken(rawToken) },
    });

    if (!request || request.status !== "PENDING" || request.expires_at.getTime() < Date.now()) {
      if (request?.status === "PENDING") {
        await prisma.dataCorrectionRequest.update({
          where: { id: request.id },
          data: { status: "EXPIRED" },
        });
      }

      return { success: false, reason: "This correction request is invalid or expired." };
    }

    if (decision === "reject") {
      await prisma.dataCorrectionRequest.update({
        where: { id: request.id },
        data: {
          status: "REJECTED",
          rejected_at: new Date(),
        },
      });
      return { success: true };
    }

    const changes = request.changes as any;
    const payload = Object.fromEntries(
      Object.entries(changes?.fields ?? {}).map(([key, value]: [string, any]) => [key, value.to])
    );

    const update = await fv_updateStudent(request.student_number, request.category, payload);
    if (!update.success) {
      return { success: false, reason: update.reason || "Unable to apply correction." };
    }

    await prisma.dataCorrectionRequest.update({
      where: { id: request.id },
      data: {
        status: "CONFIRMED",
        confirmed_at: new Date(),
      },
    });

    return { success: true };
  } catch (err) {
    console.error("Failed to resolve correction request:", err);
    return { success: false, reason: "Unable to resolve correction request." };
  }
}

//get total count of unverified students
export async function getUnverifiedStudentCount() {
  return prisma.studentAuth.count({
    where: {
      is_verified: false
    },
  });
}

//on fetch for unverified students (offset-based pagination)
export async function gethUnverifiedStudents(page: number) {
  const skip = (page - 1) * STUDENTS_PER_PAGE;
  return prisma.student.findMany({
    skip: skip,
    take: STUDENTS_PER_PAGE,
    orderBy: {
      id: 'asc'
    },
    where: {
      studentAuth: {
        is_verified: false,
      },
    },
    include: {
      studentDetail: true,
    }
  });
}

//get student by id (search query)
export async function getUnverifiedStudentById(student_id: number) {
  const student = await prisma.student.findUnique({
    where: {
      student_number: student_id,
    },
    include: {
      studentDetail: true,
      studentAuth: {
        select: {
          is_verified: true,
        },
      },
    },
  });

  if (!student) {
    return {
      success: false,
      reason: `Student ${student_id} is not found`
    };
  }

  if (student.studentAuth?.is_verified) {
    return {
      success: false,
      reason: "Student was already approved"
    };
  }

  return { 
    success: true,
    student
   };
} 

export async function addSchedule(date: string, am_cap: number, pm_cap: number) {
  const scheduleDate = new Date(`${date}T00:00:00.000Z`);
  const morningCapacity = Math.trunc(am_cap);
  const afternoonCapacity = Math.trunc(pm_cap);

  if (!Number.isInteger(morningCapacity) || !Number.isInteger(afternoonCapacity) || morningCapacity < 0 || afternoonCapacity < 0) {
    throw new Error("INVALID_SCHEDULE_CAPACITY");
  }

  if (isPastUtcDate(scheduleDate)) {
    throw new Error("PAST_SCHEDULE_DATE");
  }

  return prisma.$transaction(async (tx) => {
    const bookingDay = await tx.bookingDay.create({
      data: {
        date: scheduleDate,
        max_morning_cap: morningCapacity,
        max_afternoon_cap: afternoonCapacity,
      },
    });

    await tx.bookingSlot.createMany({
      data: buildBookingSlotData(bookingDay.id, morningCapacity, afternoonCapacity),
      skipDuplicates: true,
    });

    return bookingDay;
  });
}

//fetch schedule per day
//TODO: paginate query or cache :P
export async function fetchSchedule() {
  const bookingDays = await prisma.bookingDay.findMany({
    include: {
      slots: {
        orderBy: [
          { start_time: "asc" },
        ],
        include: {
          bookings: {
            include: {
              student: {
                select: {
                  first_name: true,
                  last_name: true,
                  student_number: true,
                  studentAuth: {
                    select: {
                      status: true
                    },
                  },
                },
              },
            },
          },
        },
      },
      bookings: {
        include: {
          booking_slot: true,
          student: {
            select: {
              first_name: true,
              last_name: true,
              student_number: true,
              studentAuth: {
                select: {
                  status: true
                },
              },
            },
          },
        },
      },
    },
  });

  return bookingDays.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => {
      const booked_count = slot.bookings.length;
      return {
        ...slot,
        booked_count,
        available_count: Math.max(slot.capacity - booked_count, 0),
      };
    }),
  }));
}

export async function toggleScheduleState(id: number) {
  try {
    const booking_day = await prisma.bookingDay.findUnique({
      where: {
        id: id
      },
      select: {
        id: true,
        is_open: true,
        date: true,
      }
    });

    if (!booking_day) {
      return {
        success: false,
        reason: `Booking with ID ${id} is not found`
      };
    }

    //block invalid date inputs
    if (!booking_day.is_open && isPastUtcDate(booking_day.date)) {
      return {
        success: false,
        reason: "Cannot re-open a schedule date that has already passed."
      };
    }

    await prisma.bookingDay.update({
      where: {
        id: booking_day.id
      },
      data: {
        is_open: !booking_day.is_open,
      }
    })  

    return { success: true };

  } catch (err: any) {
    return { 
      success: false, 
      reason: "Something went wrong!"
    };
  }
}

export async function updateScheduleCapacity(id: number, session: string, new_cap: number) {
  const session_type = session === "AM" ? "max_morning_cap" : "max_afternoon_cap";
  const nextCapacity = Math.trunc(new_cap);

  if (!isBookingPeriod(session) || !Number.isInteger(nextCapacity) || nextCapacity < 0) {
    return {
      success: false,
      reason: "Invalid schedule capacity request."
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const booking_day = await tx.bookingDay.findUnique({
        where: {
          id: id
        },
        include: {
          slots: {
            where: {
              period: session,
            },
            include: {
              _count: {
                select: {
                  bookings: true,
                },
              },
            },
          },
        },
      });

      if (!booking_day) {
        return {
          success: false,
          reason: `Booking with ID ${id} is not found`
        };
      }

      await tx.bookingSlot.createMany({
        data: buildBookingSlotData(booking_day.id, booking_day.max_morning_cap, booking_day.max_afternoon_cap),
        skipDuplicates: true,
      });

      const slots = await tx.bookingSlot.findMany({
        where: {
          booking_day_id: booking_day.id,
          period: session,
        },
        orderBy: {
          start_time: "asc",
        },
        include: {
          _count: {
            select: {
              bookings: true,
            },
          },
        },
      });

      const nextSlots = distributePeriodSlots(session, nextCapacity);

      for (const nextSlot of nextSlots) {
        const existingSlot = slots.find((slot) => slot.start_time === nextSlot.start_time && slot.end_time === nextSlot.end_time);
        const bookedCount = existingSlot?._count.bookings ?? 0;

        if (nextSlot.capacity < bookedCount) {
          return {
            success: false,
            reason: `${nextSlot.start_time}-${nextSlot.end_time} already has ${bookedCount} booked student(s). Increase the ${session} total capacity before saving.`
          };
        }
      }

      await tx.bookingDay.update({
        where: {
          id: booking_day.id
        },
        data: {
          [session_type]: nextCapacity
        }
      });

      await Promise.all(nextSlots.map((nextSlot) => {
        const existingSlot = slots.find((slot) => slot.start_time === nextSlot.start_time && slot.end_time === nextSlot.end_time);
        if (!existingSlot) {
          return tx.bookingSlot.create({
            data: {
              booking_day_id: booking_day.id,
              period: nextSlot.period,
              start_time: nextSlot.start_time,
              end_time: nextSlot.end_time,
              capacity: nextSlot.capacity,
              is_open: nextSlot.is_open,
            },
          });
        }

        return tx.bookingSlot.update({
          where: {
            id: existingSlot.id,
          },
          data: {
            capacity: nextSlot.capacity,
            is_open: nextSlot.is_open,
          },
        });
      }));

      return { success: true };
    });

  } catch (err: any) {
    return { 
      success: false, 
      reason: "Something went wrong!"
    };
  }
}

export async function m_queryByFilter(page: number, dept: string, course: string, major: string, status: string) {
  const safe_page = page > 0 ? page : 1;
  const skip = (safe_page - 1) * M_STUDENTS_PER_PAGE;

  const where: any = {};
  if (dept !== "ALL") where.department = dept;
  if (course !== "ALL") where.course = course;
  if (major !== "ALL") where.major = major;

  if (status !== "ALL") {
    const status_map = STATUS_MAP[Number(status)];
    if (status_map) {
      where.studentAuth = { status: status_map };
    }
  }
  
  const total_students = await prisma.student.count();
  const total_result = await prisma.student.count({where});

  const students = await prisma.student.findMany({
    skip,
    take: M_STUDENTS_PER_PAGE,
    orderBy: { id: "asc" as const },
    where,
    include: {
      studentDetail: true,
      studentAuth: {
        select: { status: true },
      },
      studentSolicitations: true,
    },
  });

  await Promise.all(students.map(async (s) => {
    if (s.studentDetail?.photo_url) {
      s.studentDetail.photo_url = await generateReadUrl(s.studentDetail.photo_url) ?? s.studentDetail.photo_url;
    }
  }));

  return { students, total_students, total_result };
}

export async function m_queryById(student_id: number) {
  const student = await prisma.student.findUnique({
    where: {
      student_number: student_id,
    },
    include: {
      studentDetail: true,
      studentAuth: {
        select: {
          status: true,
        }
      },
      studentSolicitations: true,
    }
  });

  if (!student) return { success: false, reason: "Student doesn't exist!" };

  if (student.studentDetail?.photo_url) {
    student.studentDetail.photo_url = await generateReadUrl(student.studentDetail.photo_url) ?? student.studentDetail.photo_url;
  }

  return { success: true, student };
}

export async function m_exportAll(dept: string, course: string, major: string, status: string) {
  const where: any = {};
  if (dept !== "ALL") where.department = dept;
  if (course !== "ALL") where.course = course;
  if (major !== "ALL") where.major = major;

  if (status !== "ALL") {
    const status_map = STATUS_MAP[Number(status)];
    if (status_map) where.studentAuth = { status: status_map };
  }

  return prisma.student.findMany({
    orderBy: { student_number: "asc" },
    where,
    include: {
      studentDetail: true,
      studentAuth: { select: { status: true } },
    },
  });
}

// ------------------------------- Image management -------------------------

// thin wrapper so the admin controller stays service-scoped
export async function img_getUploadUrl(
  student_number: number,
  type: "GRADUATION" | "THEME",
  year: number,
  ext: string,
  mime: string
) {
  return generateImageUploadUrl(student_number, type, year, ext, mime);
}

// paginated students with their graduation/theme image status for a given year,
// filterable by dept/course/major/student status + missing-image scope
export async function img_queryStudents(
  id: number,
  page: number,
  dept: string,
  course: string,
  major: string,
  status: string,
  year: number,
  missing: string
) {
  const safe_page = page > 0 ? page : 1;
  const skip = (safe_page - 1) * I_STUDENTS_PER_PAGE;

  const where: any = {};
  
  //if no id provided then run query as usual otherwise ignore filters <3
  if (!id) {
    if (dept !== "ALL") where.department = dept;
    if (course !== "ALL") where.course = course;
    if (major !== "ALL") where.major = major;
    if (status !== "ALL") {
      const status_map = STATUS_MAP[Number(status)];
      if (status_map) where.studentAuth = { status: status_map };
    }

    // image-presence filter, scoped to the selected year
    const gradNone = { images: { none: { type: ImageType.GRADUATION, year } } };
    const themeNone = { images: { none: { type: ImageType.THEME, year } } };
    const gradSome = { images: { some: { type: ImageType.GRADUATION, year } } };
    const themeSome = { images: { some: { type: ImageType.THEME, year } } };

    switch (missing) {
      case "GRADUATION":
        where.images = { none: { type: ImageType.GRADUATION, year } };
        break;
      case "THEME":
        where.images = { none: { type: ImageType.THEME, year } };
        break;
      case "BOTH":
        where.AND = [gradNone, themeNone];
        break;
      case "NONE": // has both already
        where.AND = [gradSome, themeSome];
        break;
      // "ALL" -> no image filter
    }
  } else {
    where.student_number = id;
  }

  const total_students = await prisma.student.count();
  const total_result = await prisma.student.count({ where });

  const students = await prisma.student.findMany({
    skip,
    take: I_STUDENTS_PER_PAGE,
    orderBy: { id: "asc" as const },
    where,
    include: {
      studentDetail: true,
      studentAuth: { select: { status: true } },
      images: { where: { year } },
    },
  });

  const shaped = await Promise.all(
    students.map(async (s) => {
      const reference_photo_url = s.studentDetail?.photo_url
        ? (await generateReadUrl(s.studentDetail.photo_url)) ?? null
        : null;

      const buildImage = async (type: ImageType) => {
        const img = s.images.find((i) => i.type === type);
        if (!img) return null;
        return {
          id: img.id,
          type: img.type,
          year: img.year,
          status: img.status,
          photo_url: (await generateReadUrl(img.photo_url)) ?? img.photo_url,
          updated_at: img.updated_at,
        };
      };

      const graduation = await buildImage(ImageType.GRADUATION);
      const theme = await buildImage(ImageType.THEME);

      const { images, ...rest } = s;
      return { ...rest, reference_photo_url, graduation, theme };
    })
  );

  return { students: shaped, total_students, total_result };
}

// upsert a graduation/theme image for a student (re-upload resets status to PENDING)
export async function img_saveImage(
  student_number: number,
  type: "GRADUATION" | "THEME",
  year: number,
  photo_url: string,
  admin_id: number
) {
  try {
    const student = await prisma.student.findUnique({
      where: { student_number },
      select: { student_number: true, first_name: true, last_name: true },
    });
    if (!student) return { success: false, reason: "Student doesn't exist!" };

    const key = { student_number, type: type as ImageType, year };

    const existing = await prisma.studentImage.findUnique({
      where: { student_number_type_year: key },
      select: { id: true },
    });
    const isReupload = !!existing;

    const image = await prisma.$transaction(async (tx) => {
      const img = await tx.studentImage.upsert({
        where: { student_number_type_year: key },
        create: {
          student_number,
          type: type as ImageType,
          year,
          photo_url,
          uploaded_by: admin_id,
          status: ImageStatus.PENDING,
        },
        update: {
          photo_url,
          status: ImageStatus.PENDING,
          uploaded_by: admin_id,
        },
      });

      await tx.logs.create({
        data: { admin_id, action: AdminActions.UPLOADED, target_id: student_number },
      });

      await tx.imageComment.create({
        data: {
          image_id: img.id,
          admin_id,
          is_system: true,
          body: isReupload ? "Re-uploaded — pending review." : "Uploaded — pending review.",
        },
      });

      return img;
    });

    // notify approvers (non-critical, outside the core transaction)
    const label = type === "GRADUATION" ? "graduation" : "theme";
    const name = studentName(student.first_name, student.last_name, student_number);
    await notifyApprovers(
      NotificationType.IMAGE_UPLOADED,
      `New ${label} photo for ${name} (${year}) needs review.`,
      image.id,
      admin_id
    );

    return { success: true };
  } catch (err) {
    console.error(`Failed to save image for student ${student_number}:`, err);
    return {
      success: false,
      reason: "An unexpected error occurred. Please try again later.",
    };
  }
}

// ----- approval forum -----

function studentName(first?: string | null, last?: string | null, student_number?: number) {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || `#${student_number ?? ""}`;
}

// ADMINISTRATOR always; MODERATOR only if flagged. `role` (from JWT) is a fast-path.
export async function img_isApprover(admin_id: number, role?: string): Promise<boolean> {
  if (role === AdminRoles.ADMINISTRATOR) return true;
  const admin = await prisma.admin.findUnique({
    where: { id: admin_id },
    select: { role: true, can_approve_images: true },
  });
  if (!admin) return false;
  if (admin.role === AdminRoles.ADMINISTRATOR) return true;
  return admin.role === AdminRoles.MODERATOR && admin.can_approve_images;
}

const STUDENT_PREVIEW_SELECT = {
  student_number: true,
  first_name: true,
  last_name: true,
  mid_name: true,
  suffix: true,
  course: true,
  studentDetail: { select: { photo_url: true } },
} as const;

async function shapeRequest(img: any) {
  return {
    id: img.id,
    type: img.type,
    year: img.year,
    status: img.status,
    photo_url: (await generateReadUrl(img.photo_url)) ?? img.photo_url,
    reference_photo_url: img.student?.studentDetail?.photo_url
      ? await generateReadUrl(img.student.studentDetail.photo_url)
      : null,
    uploaded_by: img.uploaded_by,
    uploader_name: studentName(img.admin?.first_name, img.admin?.last_name),
    created_at: img.created_at,
    updated_at: img.updated_at,
    student: img.student
      ? {
          student_number: img.student.student_number,
          first_name: img.student.first_name,
          last_name: img.student.last_name,
          mid_name: img.student.mid_name,
          suffix: img.student.suffix,
          course: img.student.course,
        }
      : null,
  };
}

// review queue: PENDING (oldest first) / RESOLVED (newest first) / ALL
export async function img_listApprovals(view: string, page: number, type: string, year: number | null) {
  const safe_page = page > 0 ? page : 1;
  const skip = (safe_page - 1) * I_STUDENTS_PER_PAGE;

  const where: any = {};
  if (view === "PENDING") where.status = ImageStatus.PENDING;
  else if (view === "RESOLVED") where.status = { in: [ImageStatus.APPROVED, ImageStatus.REJECTED] };

  if (type === "GRADUATION" || type === "THEME") where.type = type;
  if (year) where.year = year;

  const total_result = await prisma.studentImage.count({ where });

  const images = await prisma.studentImage.findMany({
    skip,
    take: I_STUDENTS_PER_PAGE,
    where,
    orderBy: { updated_at: view === "PENDING" ? "asc" : "desc" },
    include: {
      student: { select: STUDENT_PREVIEW_SELECT },
      admin: { select: { first_name: true, last_name: true } },
      _count: { select: { comments: true } },
    },
  });

  const shaped = await Promise.all(
    images.map(async (img) => ({
      ...(await shapeRequest(img)),
      comment_count: img._count.comments,
    }))
  );

  return { images: shaped, total_result };
}

// thread + request detail; enforces approver-or-uploader access
export async function img_getThread(image_id: number, requester_id: number, requester_role?: string) {
  const image = await prisma.studentImage.findUnique({
    where: { id: image_id },
    include: {
      student: { select: STUDENT_PREVIEW_SELECT },
      admin: { select: { first_name: true, last_name: true } },
      comments: {
        orderBy: { created_at: "asc" },
        include: { admin: { select: { first_name: true, last_name: true, role: true } } },
      },
    },
  });
  if (!image) return { success: false, reason: "Request not found." };

  const approver = await img_isApprover(requester_id, requester_role);
  if (!approver && image.uploaded_by !== requester_id) {
    return { success: false, forbidden: true, reason: "Forbidden." };
  }

  const request = await shapeRequest(image);
  const comments = image.comments.map((c) => ({
    id: c.id,
    body: c.body,
    is_system: c.is_system,
    created_at: c.created_at,
    author_name: studentName(c.admin?.first_name, c.admin?.last_name),
    author_role: c.admin?.role,
  }));

  return { success: true, request, comments };
}

// add a comment; approver-or-uploader; notifies participants
export async function img_addComment(image_id: number, body: string, admin_id: number, role?: string) {
  const image = await prisma.studentImage.findUnique({
    where: { id: image_id },
    select: {
      id: true,
      uploaded_by: true,
      type: true,
      student: { select: { first_name: true, last_name: true, student_number: true } },
    },
  });
  if (!image) return { success: false, reason: "Request not found." };

  const approver = await img_isApprover(admin_id, role);
  if (!approver && image.uploaded_by !== admin_id) {
    return { success: false, forbidden: true, reason: "Forbidden." };
  }

  const comment = await prisma.imageComment.create({
    data: { image_id, admin_id, body, is_system: false },
    include: { admin: { select: { first_name: true, last_name: true, role: true } } },
  });

  const label = image.type === ImageType.GRADUATION ? "graduation" : "theme";
  const name = studentName(image.student?.first_name, image.student?.last_name, image.student?.student_number);
  await notifyParticipants(
    { id: image.id, uploaded_by: image.uploaded_by },
    NotificationType.IMAGE_COMMENT,
    `New comment on ${label} photo for ${name}.`,
    admin_id
  );

  return {
    success: true,
    comment: {
      id: comment.id,
      body: comment.body,
      is_system: comment.is_system,
      created_at: comment.created_at,
      author_name: studentName(comment.admin?.first_name, comment.admin?.last_name),
      author_role: comment.admin?.role,
    },
  };
}

// approve/reject; reject requires a reason; records a system comment + notifies uploader
export async function img_decide(image_id: number, action: string, note: string | undefined, admin_id: number) {
  const isApprove = action === "APPROVE";
  if (!isApprove && action !== "REJECT") {
    return { success: false, reason: "Invalid action." };
  }
  if (!isApprove && (!note || !note.trim())) {
    return { success: false, reason: "A reason is required to reject." };
  }

  const image = await prisma.studentImage.findUnique({
    where: { id: image_id },
    select: {
      id: true,
      uploaded_by: true,
      type: true,
      year: true,
      student: { select: { first_name: true, last_name: true, student_number: true } },
    },
  });
  if (!image) return { success: false, reason: "Request not found." };

  const newStatus = isApprove ? ImageStatus.APPROVED : ImageStatus.REJECTED;
  const decided = isApprove ? "Approved" : "Rejected";
  const trimmedNote = note?.trim();
  const systemBody = trimmedNote ? `${decided} — ${trimmedNote}` : `${decided}.`;

  await prisma.$transaction([
    prisma.studentImage.update({ where: { id: image_id }, data: { status: newStatus } }),
    prisma.imageComment.create({
      data: { image_id, admin_id, is_system: true, body: systemBody },
    }),
  ]);

  // notify the uploader (skip if the decider is the uploader)
  if (image.uploaded_by !== admin_id) {
    const label = image.type === ImageType.GRADUATION ? "graduation" : "theme";
    const name = studentName(image.student?.first_name, image.student?.last_name, image.student?.student_number);
    const message = isApprove
      ? `Your ${label} photo for ${name} (${image.year}) was approved.`
      : `Your ${label} photo for ${name} (${image.year}) was rejected: ${trimmedNote}`;
    await notifyUser(
      image.uploaded_by,
      isApprove ? NotificationType.IMAGE_APPROVED : NotificationType.IMAGE_REJECTED,
      message,
      image.id
    );
  }

  return { success: true };
}

// ---------------------------------------------------------------------
//get fv_students by id
export async function fv_queryStudentById(id: number) {
  const student = await prisma.student.findUnique({
    where: {
      student_number: id,
      studentAuth: {
        status: StudentStatus.REGISTERED
      },
    },
    include: {
      studentDetail: true,
    }
  });

  if (!student) {
    return { sucesss: false, reason: "student doesn't exist" }
  }

  if (student.studentDetail?.photo_url) {
    student.studentDetail.photo_url = await generateReadUrl(student.studentDetail.photo_url);
  }

  return { student, total_students: 1 };
}

//get paginated registered students
export async function fv_queryStudents(page: number) {
  const skip = (page - 1) * F_STUDENTS_PER_PAGE;

  const students = await prisma.student.findMany({
    skip: skip,
    take: F_STUDENTS_PER_PAGE,
    where: {
      studentAuth: {
        status: StudentStatus.REGISTERED
      }
    },
    orderBy: {
      id: 'asc'
    },
    include: {
      studentDetail: true,
    }
  });

  const total_students = await prisma.studentAuth.count({
    where: {
      status: StudentStatus.REGISTERED
    }
  });

  await Promise.all(students.map(async (s) => {
    if (s.studentDetail?.photo_url) {
      s.studentDetail.photo_url = await generateReadUrl(s.studentDetail.photo_url) ?? s.studentDetail.photo_url;
    }
  }));

  return { students, total_students };
}

export async function fv_markAttended(studentId: number) {
  try {
    const student = await prisma.student.findUnique({
      where: { student_number: studentId },
      select: {
        student_number: true,
        studentAuth: {
          select: {
            student_number: true,
          },
        },
        studentDetail: {
          select: {
            photo_url: true,
          },
        },
        booking: {
          orderBy: {
            created_at: "desc",
          },
          take: 1,
          select: {
            booking_day_id: true,
            period: true,
          },
        },
      },
    });

    if (!student?.studentAuth) {
      return { success: false, reason: "Student doesn't exist!" };
    }

    const latestBooking = student.booking[0];
    if (!latestBooking) {
      return { success: false, reason: "No booking found for this student." };
    }

    await prisma.$transaction([
      prisma.studentAuth.update({
        where: { student_number: studentId },
        data: {
          status: StudentStatus.ATTENDED,
        },
      }),
      prisma.attendanceQueue.create({
        data: {
          student_number: studentId,
          booking_day_id: latestBooking.booking_day_id,
          period: latestBooking.period,
          photo_url: student.studentDetail?.photo_url ?? null,
        },
      }),
    ]);

    return { success: true };
  } catch (err) {
    console.error(`Failed to mark student ${studentId} as attended:`, err);
    return {
      success: false,
      reason: "An unexpected error occurred. Please try again later.",
    };
  }
}

export async function fv_fetchAttendanceQueue() {
  const queue = await prisma.attendanceQueue.findMany({
    orderBy: {
      id: "asc",
    },
    include: {
      student: {
        select: {
          first_name: true,
          mid_name: true,
          last_name: true,
        },
      },
    },
  });

  await Promise.all(queue.map(async (entry) => {
    if (entry.photo_url) {
      entry.photo_url = await generateReadUrl(entry.photo_url) ?? entry.photo_url;
    }
  }));

  return queue;
}

export async function fv_markFullyVerified(student_id: number, admin_id: string) {
  try {
    const student = await prisma.student.findUnique({
      where: { student_number: student_id },
      select: { 
        student_number: true,
        school_email: true,
        personal_email: true,
        studentAuth: true,
       },
    });

    if (!student) {
      return { success: false, reason: "Student doesn't exist!" };
    }

    await prisma.$transaction([
      prisma.studentAuth.update({
        where: { student_number: student_id },
        data: {
          status: StudentStatus.FULLY_VERIFIED,
        },
      }),

      prisma.logs.create({
        data: {
          admin_id: parseInt(admin_id),
          action: AdminActions.VERIFIED,
          target_id: student_id,
        },
      }),
    ]);

    //generate temp pass and hash
    const temp_pass = await generatePass();

    //check if school email is null then fallback to their personal email instead
    const email = student.school_email ? student.school_email : student.personal_email; 

    //send credentials to the respective student email
    const send_pass = await sendCreds(temp_pass.actual_pass, email);
    if (!send_pass) return { success: false, reason: "Something went wrong when sending the password." };

    //upload hashed pass to db
    await prisma.student.update({
      where : {
        student_number: student.student_number
      },
      data: {
        studentAuth: {
          update: {
            hashed_password: temp_pass.hash_pass,
            is_verified: true,
          },
        },
      },
    });

    return { success: true };
  } catch (err) {
    console.error(`Failed to fully verify student ${student_id}:`, err);
    return {
      success: false,
      reason: "An unexpected error occurred. Please try again later.",
    };
  }
}

export async function getAdminList() {
  try {
    const admins = await prisma.admin.findMany({
      where: {
        NOT: { role: 'ADMINISTRATOR' }
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        role: true,
        last_login: true,
        can_approve_images: true
      },
      orderBy: { last_name: 'asc' }
    });
    return { success: true, admins };
  } catch (err) {
    console.error("getAdminList error:", err);
    return { success: false, reason: "Something went wrong!" };
  }
}

export async function updateAdminRole(targetId: number, newRole: string) {
  const validRoles = ['MODERATOR', 'MEMBER'];
  if (!validRoles.includes(newRole)) {
    return { success: false, reason: "Invalid role. Only MODERATOR or MEMBER are allowed." };
  }

  try {
    await prisma.admin.update({
      where: { id: targetId },
      data: { role: newRole as any }
    });
    return { success: true };
  } catch (err) {
    console.error("updateAdminRole error:", err);
    return { success: false, reason: "Admin not found or update failed." };
  }
}

// toggle a moderator's image-approver flag (administrators only; moderators only)
export async function updateImageApprover(targetId: number, value: boolean) {
  try {
    const target = await prisma.admin.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (!target) return { success: false, reason: "Admin not found." };
    if (target.role !== AdminRoles.MODERATOR) {
      return { success: false, reason: "Only moderators can be image approvers." };
    }

    await prisma.admin.update({
      where: { id: targetId },
      data: { can_approve_images: value },
    });
    return { success: true };
  } catch (err) {
    console.error("updateImageApprover error:", err);
    return { success: false, reason: "Admin not found or update failed." };
  }
}

export async function fv_updateStudent(studentId: number, type: string, data: any) {
  try {
    const normalizedType = String(type).toLowerCase() as FinalizeUpdateType;
    const validTypes: FinalizeUpdateType[] = ["personal", "academic", "contact", "family"];

    if (!validTypes.includes(normalizedType)) {
      return { success: false, reason: "Invalid update type." };
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { success: false, reason: "Invalid request body." };
    }

    const payloadEntries = Object.entries(data).filter(([, value]) => value !== undefined);
    if (payloadEntries.length === 0) {
      return { success: false, reason: "No fields to update." };
    }

    const studentExists = await prisma.student.findUnique({
      where: { student_number: studentId },
      select: { student_number: true },
    });

    if (!studentExists) {
      return { success: false, reason: "Student doesn't exist!" };
    }

    if (normalizedType === "personal" || normalizedType === "academic") {
      const allowed = normalizedType === "personal" ? STUDENT_PERSONAL_FIELDS : STUDENT_ACADEMIC_FIELDS;
      const invalidFields = payloadEntries
        .map(([key]) => key)
        .filter((key) => !allowed.has(key));

      if (invalidFields.length > 0) {
        return { success: false, reason: `Invalid field(s) for ${normalizedType}: ${invalidFields.join(", ")}` };
      }

      const studentData: Record<string, any> = {};
      for (const [key, value] of payloadEntries) {
        const fieldKey = key === "thesis" ? "thesis_title" : key;
        studentData[fieldKey] = value;
      }

      await prisma.student.update({
        where: { student_number: studentId },
        data: studentData,
      });

      return { success: true };
    }

    const allowed = normalizedType === "contact" ? STUDENT_DETAIL_CONTACT_FIELDS : STUDENT_DETAIL_FAMILY_FIELDS;
    const invalidFields = payloadEntries
      .map(([key]) => key)
      .filter((key) => !allowed.has(key));

    if (invalidFields.length > 0) {
      return { success: false, reason: `Invalid field(s) for ${normalizedType}: ${invalidFields.join(", ")}` };
    }

    if (normalizedType === "contact") {
      const studentData: Record<string, any> = {};
      const detailData: Record<string, any> = {};

      for (const [key, value] of payloadEntries) {
        if (STUDENT_CONTACT_EMAIL_FIELDS.has(key)) {
          studentData[key] = value;
        } else {
          detailData[key] = value;
        }
      }

      const updates: any[] = [];
      if (Object.keys(studentData).length > 0) {
        updates.push(
          prisma.student.update({
            where: { student_number: studentId },
            data: studentData,
          })
        );
      }

      if (Object.keys(detailData).length > 0) {
        updates.push(
          prisma.student.update({
            where: { student_number: studentId },
            data: {
              studentDetail: {
                update: detailData,
              },
            },
          })
        );
      }

      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }

      return { success: true };
    }

    const detailData: Record<string, any> = {};
    for (const [key, value] of payloadEntries) {
      detailData[key] = value;
    }

    await prisma.student.update({
      where: { student_number: studentId },
      data: {
        studentDetail: {
          update: detailData,
        },
      },
    });

    return { success: true };
  } catch (err) {
    console.error(`Failed to update student ${studentId}:`, err);
    return {
      success: false,
      reason: "An unexpected error occurred. Please try again later.",
    };
  }
}
