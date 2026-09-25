import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const requests = await prisma.transferRequest.findMany({
    include: {
      asset: { select: { id: true, name: true, tokenId: true, ownerId: true } },
      fromUser: { select: { id: true, displayName: true } },
      toUser: { select: { id: true, displayName: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Found ${requests.length} transfer requests:`);
  for (const r of requests) {
    console.log({
      id: r.id,
      asset: r.asset.name,
      tokenId: r.asset.tokenId,
      from: r.fromUser.displayName,
      to: r.toUser.displayName,
      status: r.status,
      txHash: r.txHash,
      createdAt: r.createdAt
    });
  }
}

main().finally(() => prisma.$disconnect());
