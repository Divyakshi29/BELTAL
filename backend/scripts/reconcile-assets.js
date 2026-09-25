import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { walletAddress: { equals: '0xDabE8bA9A880EEd8Bb2b754680eFf7D0e23777df', mode: 'insensitive' } }
  });

  if (!user) {
    console.error('User not found!');
    return;
  }

  // 1. Reconcile Token 1002
  await prisma.asset.upsert({
    where: { tokenId: '1002' },
    update: {
      name: 'BEL-RADAR-SDR-001',
      classificationTier: 1,
      sbu: 'SBU_CYBER',
      cid: 'bafkreic7533e553328f454dbaabb77101f54627',
      mintTxHash: '0xc03ff7c2aaa32b103183c2f1d58d42d5b9ed50f60c0c7fa5a93db046910ba5e5',
      ownerId: user.id,
      metadata: { assetTag: 'BEL-RADAR-SDR-001' }
    },
    create: {
      tokenId: '1002',
      name: 'BEL-RADAR-SDR-001',
      classificationTier: 1,
      sbu: 'SBU_CYBER',
      cid: 'bafkreic7533e553328f454dbaabb77101f54627',
      mintTxHash: '0xc03ff7c2aaa32b103183c2f1d58d42d5b9ed50f60c0c7fa5a93db046910ba5e5',
      ownerId: user.id,
      metadata: { assetTag: 'BEL-RADAR-SDR-001' }
    }
  });
  console.log('Reconciled Token 1002 in Postgres');

  // 2. Reconcile Token 1003
  await prisma.asset.upsert({
    where: { tokenId: '1003' },
    update: {
      name: 'Testing',
      classificationTier: 1,
      sbu: 'SBU_CYBER',
      cid: 'bafkreibtestingprocess3e32ad489a4f1e6d856faf',
      mintTxHash: '0x3e32ad489a4f1e6d856fafefa84e5deaf4ccffae1a758e911ac8892cad551e5a',
      ownerId: user.id,
      metadata: { assetTag: 'Testing', description: 'Testing Process' }
    },
    create: {
      tokenId: '1003',
      name: 'Testing',
      classificationTier: 1,
      sbu: 'SBU_CYBER',
      cid: 'bafkreibtestingprocess3e32ad489a4f1e6d856faf',
      mintTxHash: '0x3e32ad489a4f1e6d856fafefa84e5deaf4ccffae1a758e911ac8892cad551e5a',
      ownerId: user.id,
      metadata: { assetTag: 'Testing', description: 'Testing Process' }
    }
  });
  console.log('Reconciled Token 1003 in Postgres');

  // 3. Clear phantom tokenIds (1005-1012) from stale old records so future on-chain mints start clean
  const stale = await prisma.asset.findMany({
    where: {
      tokenId: { in: ['1005', '1006', '1007', '1008', '1009', '1010', '1011', '1012'] }
    }
  });

  for (const item of stale) {
    await prisma.asset.update({
      where: { id: item.id },
      data: { tokenId: null }
    });
    console.log(`Cleared unminted mock tokenId from ${item.name} (${item.id})`);
  }

  console.log('Reconciliation complete!');
}

main().finally(() => prisma.$disconnect());
