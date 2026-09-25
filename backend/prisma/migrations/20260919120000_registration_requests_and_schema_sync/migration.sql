-- Brings the migration history in line with schema.prisma and adds
-- self-service registration (RegistrationRequest / RegistrationStatus).
-- Hand-written from `prisma migrate diff --from-empty` against the schema
-- minus what 20260915111801_init already creates.

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum (AuditEventType values added after the init migration)
ALTER TYPE "AuditEventType" ADD VALUE 'TRANSFER_REJECTED';
ALTER TYPE "AuditEventType" ADD VALUE 'PACS_ACCESS_GRANTED';
ALTER TYPE "AuditEventType" ADD VALUE 'PACS_ACCESS_DENIED';

-- CreateTable
CREATE TABLE "CrossSbuPass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetSbu" "Sbu" NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "issuedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossSbuPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationRequest" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "requestedSbu" "Sbu" NOT NULL,
    "note" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_type_createdAt_idx" ON "AuditEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "AuditEvent_txHash_idx" ON "AuditEvent"("txHash");

-- CreateIndex
CREATE INDEX "CrossSbuPass_userId_targetSbu_idx" ON "CrossSbuPass"("userId", "targetSbu");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationRequest_walletAddress_key" ON "RegistrationRequest"("walletAddress");

-- CreateIndex
CREATE INDEX "RegistrationRequest_status_idx" ON "RegistrationRequest"("status");

-- CreateIndex
CREATE INDEX "RegistrationRequest_externalId_idx" ON "RegistrationRequest"("externalId");

-- AddForeignKey
ALTER TABLE "CrossSbuPass" ADD CONSTRAINT "CrossSbuPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossSbuPass" ADD CONSTRAINT "CrossSbuPass_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationRequest" ADD CONSTRAINT "RegistrationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
