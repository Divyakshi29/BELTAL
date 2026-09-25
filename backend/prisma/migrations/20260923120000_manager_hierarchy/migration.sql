-- Org-structure layer: a person-to-person reporting chain, separate from
-- both RBAC (Role) and security clearance (clearanceLevel). SBU membership
-- stays the access-scoping dimension; this is purely organizational and
-- off-chain, so it needs no contract change and no chain call.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "seniorityGrade" INTEGER;
ALTER TABLE "User" ADD COLUMN "managerId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");
