import prisma from "../../config/prisma";

export async function createStudent(body: any) {
  return prisma.student.create({
    data: {
      student_number: parseInt(body.id),
      first_name: body.first_name,
      last_name: body.last_name,
      mid_name: body.middle_name,
      school_email: body.school_email,
      personal_email: body.personal_email,
      department: body.academics.department,
      course: body.academics.course,
      major: body.academics.major,
      nickname: body.nickname,
      suffix: body.suffix,
      thesis_title: body.academics.thesis,      

      studentDetail: {
        create: {
          birth_date: new Date(body.birthdate),
          contact_num: body.contact_num,
          mothers_name: body.parent?.mothers_name,
          fathers_name: body.parent?.father_name,
          guardians_name: body.guardian?.guardians_name,
          province: body.province,
          city: body.city,
          barangay: body.barangay
        },
      },

      StudentAuth: {
        create: {
          is_verified: false,
        },
      },
    },
  });
}