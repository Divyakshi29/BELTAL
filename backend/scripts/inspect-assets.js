import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const assets = await prisma.asset.findMany({
    select: {
      id: true,
      name: true,
      tokenId: true,
      mintTxHash: true,
      classificationTier: true,
      sbu: true,
      ownerId: true,
      createdAt: true
    }
  });
  console.log(`Total assets: ${assets.length}`);
  console.log(JSON.stringify(assets, null, 2));
}

main().finally(() => prisma.$disconnect());
