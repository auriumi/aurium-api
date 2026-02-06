import prisma from "../../config/prisma";

export async function createStudent(body: any) {
  return prisma.student.create({
    data: {
      school_email: body.school_email,
      personal_email: body.personal_email,
      last_name: body.last_name,
      first_name: body.first_name,
      mid_name: body.middle_name,
      suffix: body.suffix,
      nickname: body.nickname,
      birth_date: new Date(body.birthdate),
      course: body.academics.course,
      major: body.academics.major,
      thesis_title: body.academics.thesis,

      //student_id
      StudentAuth: {
        create: {
          student_number: parseInt(body.id),
        },
      },
      //TODO: add more required data later on..
    },
  });
}

export async function fetchUnverifiedStudents() {
  return prisma.student.findMany({
    where: {
      StudentAuth: {
        is_verified: false,
      },
    },

    select: {
      first_name: true,
      last_name: true,
      course: true,
      school_email: true,
      StudentAuth: {
        select: {
          student_number: true,
        },
      },
    },
  });
}