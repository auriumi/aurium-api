import prisma from "../../config/prisma";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from 'resend';
import { AdminActions, StudentStatus } from "@prisma/client";

const resend = new Resend(process.env.RESEND_API);
const DOMAIN = "auriumi.cloud";

//pagination query
const STUDENTS_PER_PAGE = 8;
const M_STUDENTS_PER_PAGE = 9;
const F_STUDENTS_PER_PAGE = 8;

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
        role: true
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

export async function verifyStudent(id: string, admin_id: string) {
  try {
    //student lookup
    const student = await prisma.student.findUnique({
      where: {
        student_number: parseInt(id),
      },
      select: {
        student_number: true,
        school_email: true,
        personal_email: true,
        studentAuth: true,
      }
    });
    if (!student) return { success: false, reason: "Student ID doesn't exist or already verified!" };

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
            status: StudentStatus.APPROVED,
          },
        },
      },
    });

    //generate log if everything succeeds
    await generateLog(parseInt(admin_id), student.student_number, AdminActions.APPROVED); 

    return { success: true };
  } catch (err: any) {
    return { 
      success: false, 
      reason: "Something went wrong!"
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

//add schedule per day
export async function addSchedule(date: string, am_cap: number, pm_cap: number) {
  return prisma.bookingDay.create({
    data: {
      date: new Date(`${date}T00:00:00.000Z`),
      max_morning_cap: am_cap,
      max_afternoon_cap: pm_cap
    }
  });
}

//fetch schedule per day
//TODO: paginate query or cache :P
export async function fetchSchedule() {
  return prisma.bookingDay.findMany({
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
  });
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
      }
    });

    if (!booking_day) {
      return {
        success: false,
        reason: `Booking with ID ${id} is not found`
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

  try {
    const booking_day = await prisma.bookingDay.findUnique({
      where: {
        id: id
      },
      select: {
        id: true,
      }
    });

    if (!booking_day) {
      return {
        success: false,
        reason: `Booking with ID ${id} is not found`
      };
    }

    await prisma.bookingDay.update({
      where: {
        id: booking_day.id
      },
      data: {
        [session_type]: new_cap
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
    },
  });

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
      }
    }
  });

  if (!student) return { success: false, reason: "Student doesn't exist!" };
  return { success: true, student };
}

//get paginated students where status is 'ATTENDED'
export async function fv_queryStudents(page: number) {
  const skip = (page - 1) * F_STUDENTS_PER_PAGE;

  const students = await prisma.student.findMany({
    skip: skip,
    take: F_STUDENTS_PER_PAGE,
    where: {
      studentAuth: {
        status: StudentStatus.ATTENDED
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
      status: StudentStatus.ATTENDED
    }
  });

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
  return await prisma.attendanceQueue.findMany({
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
}

export async function fv_markFullyVerified(studentId: number, adminId: number) {
  try {
    const auth = await prisma.studentAuth.findUnique({
      where: { student_number: studentId },
      select: { student_number: true },
    });

    if (!auth) {
      return { success: false, reason: "Student doesn't exist!" };
    }

    await prisma.$transaction([
      prisma.studentAuth.update({
        where: { student_number: studentId },
        data: {
          status: StudentStatus.FULLY_VERIFIED,
        },
      }),
      prisma.logs.create({
        data: {
          admin_id: adminId,
          action: AdminActions.VERIFIED,
          target_id: studentId,
        },
      }),
    ]);

    return { success: true };
  } catch (err) {
    console.error(`Failed to fully verify student ${studentId}:`, err);
    return {
      success: false,
      reason: "An unexpected error occurred. Please try again later.",
    };
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