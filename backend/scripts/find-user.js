import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { walletAddress: { equals: '0xDabE8bA9A880EEd8Bb2b754680eFf7D0e23777df', mode: 'insensitive' } }
  });
  console.log('User for 0xDabE8bA9A880EEd8Bb2b754680eFf7D0e23777df:', user ? { id: user.id, name: user.displayName, sbu: user.sbu, clearance: user.clearanceLevel } : 'Not found');
}

main().finally(() => prisma.$disconnect());
