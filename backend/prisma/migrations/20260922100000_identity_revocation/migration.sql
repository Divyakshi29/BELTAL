-- Mirror IdentityRegistry revocation (quarantine) in the read cache so the API
-- can reject a revoked identity on the very next request, without waiting for
-- its JWT to expire. The chain remains the source of truth.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "revocationReason" TEXT,
ADD COLUMN "revokeTxHash" TEXT;
