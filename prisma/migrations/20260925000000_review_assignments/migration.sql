-- CreateEnum
CREATE TYPE "ReviewCapability" AS ENUM ('RAC_CHECK', 'INFORMATION_PROOFREADER', 'INFORMATION_QC', 'PHOTO_UPLOADER', 'PHOTO_QC', 'FINAL_MODERATOR', 'IT_CORRECTION');

-- CreateTable
CREATE TABLE "ReviewAssignment" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "capability" "ReviewCapability" NOT NULL,
    "department" TEXT,
    "course" TEXT,
    "major" TEXT,
    "granted_by" INTEGER NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by" INTEGER,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "ReviewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewAssignment_admin_id_revoked_at_idx" ON "ReviewAssignment"("admin_id", "revoked_at");

-- CreateIndex
CREATE INDEX "ReviewAssignment_capability_revoked_at_idx" ON "ReviewAssignment"("capability", "revoked_at");

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Nullable scope parts mean "all" at that level. Enforce the hierarchy and
-- keep revocation attribution with the historical assignment.
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_scope_check" CHECK (
    ("department" IS NULL OR char_length(trim("department")) BETWEEN 1 AND 120) AND
    ("course" IS NULL OR ("department" IS NOT NULL AND char_length(trim("course")) BETWEEN 1 AND 120)) AND
    ("major" IS NULL OR ("course" IS NOT NULL AND char_length(trim("major")) BETWEEN 1 AND 120)) AND
    ("capability" <> 'FINAL_MODERATOR' OR ("department" IS NULL AND "course" IS NULL AND "major" IS NULL))
);

ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_revocation_check" CHECK (
    ("revoked_at" IS NULL) = ("revoked_by" IS NULL)
);

CREATE UNIQUE INDEX "ReviewAssignment_active_scope_key" ON "ReviewAssignment" (
    "admin_id", "capability", coalesce("department", ''), coalesce("course", ''), coalesce("major", '')
) WHERE "revoked_at" IS NULL;

CREATE UNIQUE INDEX "ReviewAssignment_one_active_moderator" ON "ReviewAssignment" ("capability")
WHERE "capability" = 'FINAL_MODERATOR' AND "revoked_at" IS NULL;
