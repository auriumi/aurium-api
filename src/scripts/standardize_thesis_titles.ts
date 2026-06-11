import prisma from "../config/prisma";
import { formatApaThesisTitle } from "../utils/thesis_title";

async function main() {
  const shouldApply = process.argv.includes("--apply");
  const students = await prisma.student.findMany({
    where: {
      thesis_title: {
        not: null,
      },
    },
    select: {
      student_number: true,
      thesis_title: true,
    },
  });

  const changes = students.flatMap((student) => {
    const original = student.thesis_title ?? "";
    const standardized = formatApaThesisTitle(original);

    return original !== standardized
      ? [{ studentNumber: student.student_number, original, standardized }]
      : [];
  });

  console.table(changes);
  console.log(
    `${changes.length} thesis title(s) would be standardized. ` +
      (shouldApply ? "Applying changes." : "Dry run only; pass --apply to update records."),
  );

  if (!shouldApply || changes.length === 0) {
    return;
  }

  await prisma.$transaction(
    changes.map((change) =>
      prisma.student.update({
        where: { student_number: change.studentNumber },
        data: { thesis_title: change.standardized },
      }),
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
