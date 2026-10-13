import { ImageType, Prisma, RacOutcome } from "@prisma/client";

// The old image table is year-only. RAC-verified graduates use the separate,
// term-aware photo track, so its missing-image filters must exclude them.
export function legacyImageFilter(missing: string, year: number): Prisma.StudentWhereInput {
  if (missing === "ALL") return {};
  const legacyOnly: Prisma.StudentWhereInput = {
    reviewCases: { none: { grad_year: year, outcome: RacOutcome.VERIFIED } },
  };
  const image = (type: ImageType, present: boolean): Prisma.StudentWhereInput => ({
    images: present ? { some: { type, year } } : { none: { type, year } },
  });
  switch (missing) {
    case "GRADUATION": return { AND: [legacyOnly, image(ImageType.GRADUATION, false)] };
    case "THEME": return { AND: [legacyOnly, image(ImageType.THEME, false)] };
    case "BOTH": return { AND: [legacyOnly, image(ImageType.GRADUATION, false), image(ImageType.THEME, false)] };
    case "NONE": return { AND: [legacyOnly, image(ImageType.GRADUATION, true), image(ImageType.THEME, true)] };
    default: return {};
  }
}
