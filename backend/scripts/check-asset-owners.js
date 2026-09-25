import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const assets = await prisma.asset.findMany({
    where: { name: { in: ['Testing', 'Aalu', 'BEL-RADAR-SDR-001'] } },
    include: { owner: true }
  });

  console.log(JSON.stringify(assets.map(a => ({
    id: a.id,
    name: a.name,
    tokenId: a.tokenId,
    ownerName: a.owner?.displayName,
    ownerWallet: a.owner?.walletAddress,
    createdAt: a.createdAt
  })), null, 2));
}

main().finally(() => prisma.$disconnect());
