-- Guardian-based account recovery (issue #51).

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newWalletAddress" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "revokeTxHash" TEXT,
    "relinkTxHash" TEXT,
    "oldWalletAddress" TEXT,
    "completedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryApproval" (
    "id" TEXT NOT NULL,
    "recoveryRequestId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Guardian_guardianId_idx" ON "Guardian"("guardianId");
CREATE UNIQUE INDEX "Guardian_userId_guardianId_key" ON "Guardian"("userId", "guardianId");
CREATE INDEX "RecoveryRequest_status_idx" ON "RecoveryRequest"("status");
CREATE INDEX "RecoveryRequest_userId_idx" ON "RecoveryRequest"("userId");
CREATE UNIQUE INDEX "RecoveryApproval_recoveryRequestId_guardianId_key" ON "RecoveryApproval"("recoveryRequestId", "guardianId");

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryRequest" ADD CONSTRAINT "RecoveryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryRequest" ADD CONSTRAINT "RecoveryRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecoveryApproval" ADD CONSTRAINT "RecoveryApproval_recoveryRequestId_fkey" FOREIGN KEY ("recoveryRequestId") REFERENCES "RecoveryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryApproval" ADD CONSTRAINT "RecoveryApproval_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
