/**
 * seed-admin.js — Upsert a wallet address as ADMIN in the BELTAL database.
 *
 * Usage:
 *   node seed-admin.js 0xYourWalletAddress
 *
 * Run from the /backend directory.
 */

import crypto from 'crypto';
import { ethers } from 'ethers';
import prisma from './src/config/db.js';

const addr = process.argv[2];

if (!addr || !addr.startsWith('0x')) {
  console.error('\n❌  Usage: node seed-admin.js 0xYourWalletAddress\n');
  process.exit(1);
}

let checksumAddr;
try {
  checksumAddr = ethers.getAddress(addr);
} catch {
  console.error('\n❌  Invalid Ethereum address:', addr);
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.createHash('sha256').update(checksumAddr + salt).digest('hex');

try {
  const user = await prisma.user.upsert({
    where:  { walletAddress: checksumAddr },
    update: { role: 'ADMIN', clearanceLevel: 4 },
    create: {
      walletAddress: checksumAddr,
      role:          'ADMIN',
      clearanceLevel: 4,
      sbu:           'SBU_CYBER',
      identityHash:  hash,
      identitySalt:  salt,
      displayName:   'System Administrator',
    },
  });

  console.log('\n✅  Admin upserted successfully!');
  console.log('   Wallet :', user.walletAddress);
  console.log('   Role   :', user.role);
  console.log('   Tier   :', user.clearanceLevel);
  console.log('\n   Sign in with this wallet at http://localhost:5173 to access /admin\n');
} catch (err) {
  console.error('\n❌  Database error:', err.message);
  if (err.message.includes('connect')) {
    console.error('   Make sure PostgreSQL is running and DATABASE_URL in .env is correct.\n');
  }
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
