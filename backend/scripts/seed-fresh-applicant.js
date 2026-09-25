import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.registrationRequest.findFirst({
    where: { walletAddress: '0x49cFa0a1824c5D6011c7D770973B5eaCc848042d' }
  });
  if (!existing) {
    const created = await prisma.registrationRequest.create({
      data: {
        walletAddress: '0x49cFa0a1824c5D6011c7D770973B5eaCc848042d',
        fullName: 'Capt. Arjun Mehra',
        externalId: 'BEL-EW-1044',
        requestedSbu: 'SBU_EW',
        note: 'Electronic Warfare officer requesting initial onboarding and clearance.',
        status: 'PENDING'
      }
    });
    console.log('Created fresh pending registration request:', created.id);
  } else {
    console.log('Already exists:', existing.id);
  }
}

main().finally(() => prisma.$disconnect());
