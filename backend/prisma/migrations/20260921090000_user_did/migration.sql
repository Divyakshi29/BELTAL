-- Persist the DID that registration already mints and writes on-chain.
-- Until now it was derived inline in identity.service.js, sent to
-- IdentityRegistry and then thrown away, so no API response could show it.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "did" TEXT;

-- Backfill existing identities with the exact string registerIdentity would
-- have sent on-chain: did:beltal:<externalId>, falling back to the first 8
-- characters of the checksummed address (minus the 0x) when there is no
-- employee code. Mirrors buildDid() in backend/src/services/identity.service.js.
UPDATE "User"
SET "did" = 'did:beltal:' || COALESCE("externalId", substring("walletAddress" from 3 for 8))
WHERE "did" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_did_key" ON "User"("did");
