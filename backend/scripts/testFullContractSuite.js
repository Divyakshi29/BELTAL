/**
 * testFullContractSuite.js — Comprehensive End-to-End Verification of the 4 Smart Contracts
 * (AuditLog #86, IdentityRegistry #87, AccessControl #88, AssetNFT #89, Deployment Pipeline #85)
 *
 * Runs against live Ethereum Sepolia Testnet
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import chainService from '../src/services/chain.service.js';
import identityService from '../src/services/identity.service.js';
import assetService from '../src/services/asset.service.js';
import tamperService from '../src/services/tamper.service.js';
import prisma from '../src/config/db.js';

let passed = 0;
let failed = 0;

function pass(msg) {
  console.log(`[PASS] ${msg}`);
  passed++;
}

function fail(msg, detail = '') {
  console.error(`[FAIL] ${msg}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

function assert(condition, passMsg, failMsg) {
  if (condition) pass(passMsg);
  else fail(failMsg);
}

const cleanupUserIds = [];
const cleanupAssetIds = [];

async function cleanup() {
  console.log('\n[Cleanup] Cleaning up test DB records...');
  for (const assetId of cleanupAssetIds) {
    await prisma.auditEvent.deleteMany({ where: { targetId: assetId } }).catch(() => {});
    await prisma.transferRequest.deleteMany({ where: { assetId } }).catch(() => {});
    await prisma.asset.deleteMany({ where: { id: assetId } }).catch(() => {});
  }
  for (const userId of cleanupUserIds) {
    await prisma.auditEvent.deleteMany({ where: { actorId: userId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
  }
}

async function main() {
  console.log('================================================================');
  console.log('TrustChain Full Smart Contract Suite Verification (Issues #85 - #89)');
  console.log('Target Network: Ethereum Sepolia');
  console.log('================================================================\n');

  // --- 1. Verify Deployment & Contract Instances ---
  console.log('--- Phase 1: Contract Connections & Configuration ---');
  const auditContract = chainService.getAuditLogContract(false);
  const identityContract = chainService.getIdentityContract(false);
  const accessContract = chainService.getAccessControlContract(false);
  const assetContract = chainService.getAssetContract(false);

  assert(Boolean(auditContract), 'AuditLog contract instance loaded', 'Failed to load AuditLog');
  assert(Boolean(identityContract), 'IdentityRegistry contract instance loaded', 'Failed to load IdentityRegistry');
  assert(Boolean(accessContract), 'AccessControl contract instance loaded', 'Failed to load AccessControl');
  assert(Boolean(assetContract), 'AssetNFT contract instance loaded', 'Failed to load AssetNFT');

  console.log(`  AuditLog Address:         ${await auditContract.getAddress()}`);
  console.log(`  IdentityRegistry Address: ${await identityContract.getAddress()}`);
  console.log(`  AccessControl Address:    ${await accessContract.getAddress()}`);
  console.log(`  AssetNFT Address:         ${await assetContract.getAddress()}\n`);

  // --- 2. IdentityRegistry & On-Chain DID Anchoring (#87) ---
  console.log('--- Phase 2: IdentityRegistry.sol (#87) Tests ---');
  const ts = Date.now();
  const testWallet = ethers.Wallet.createRandom().address;
  const testDid = `did:beltal:BEL-RAD-${ts % 10000}`;
  const testHash = ethers.keccak256(ethers.toUtf8Bytes(`EMP-${ts}-SECRET`));
  const testClearance = 3;
  const testSbu = 'SBU_RADAR';

  console.log(`Registering identity on-chain for ${testWallet}...`);
  const regResult = await chainService.registerIdentityOnChain({
    walletAddress: testWallet,
    did: testDid,
    identityHash: testHash,
    clearanceLevel: testClearance,
    sbu: testSbu,
  });

  assert(regResult.confirmed === true, `Identity registered on Sepolia (Tx: ${regResult.txHash})`, 'Failed to register identity');

  console.log('Verifying identity on-chain...');
  const verifyResult = await chainService.verifyIdentityOnChain({
    walletAddress: testWallet,
    identityHash: testHash,
  });

  assert(verifyResult.verified === true, 'verifyIdentityOnChain confirmed hash match', 'On-chain verify failed');
  assert(verifyResult.clearanceLevel === testClearance, `Clearance level verified as Level ${testClearance}`, 'Clearance mismatch');
  assert(verifyResult.sbuCode === testSbu, `SBU verified as ${testSbu}`, 'SBU mismatch');

  // Test negative hash verification
  const fakeHash = ethers.keccak256(ethers.toUtf8Bytes('FAKE_HASH'));
  const fakeVerify = await chainService.verifyIdentityOnChain({
    walletAddress: testWallet,
    identityHash: fakeHash,
  });
  assert(fakeVerify.verified === false, 'Fake hash correctly rejected by on-chain verifier', 'Fake hash unexpectedly accepted');

  // --- 3. AccessControl.sol & PACS Zone Evaluation (#88) ---
  console.log('\n--- Phase 3: AccessControl.sol (#88) Tests ---');
  const testZoneId = `ZONE_TEST_${ts % 10000}`;
  const testZoneBytes32 = ethers.encodeBytes32String(testZoneId.slice(0, 31));

  console.log(`Creating facility zone "${testZoneId}" on-chain (Req Clearance: Level 3, SBU: SBU_RADAR)...`);
  const accessSigner = chainService.getAccessControlContract(true);
  const createZoneTx = await accessSigner.createZone(
    testZoneBytes32,
    3,
    ethers.encodeBytes32String('SBU_RADAR')
  );
  await createZoneTx.wait();
  pass(`Facility zone ${testZoneId} configured on Sepolia`);

  console.log('Checking access for Level 3 Radar Engineer...');
  const accessCheck1 = await chainService.canAccessZoneOnChain({
    walletAddress: testWallet,
    zoneId: testZoneId,
  });
  assert(accessCheck1.allowed === true, `Access Granted: ${accessCheck1.reason}`, `Expected granted, got: ${accessCheck1.reason}`);

  // Test clearance rejection
  const lowClearanceWallet = ethers.Wallet.createRandom().address;
  await (await chainService.registerIdentityOnChain({
    walletAddress: lowClearanceWallet,
    did: `did:beltal:LOW-${ts % 10000}`,
    identityHash: ethers.keccak256(ethers.toUtf8Bytes('LOW_CLEARANCE')),
    clearanceLevel: 1,
    sbu: 'SBU_RADAR',
  })).confirmed;

  const accessCheck2 = await chainService.canAccessZoneOnChain({
    walletAddress: lowClearanceWallet,
    zoneId: testZoneId,
  });
  assert(accessCheck2.allowed === false, `Low clearance correctly denied: "${accessCheck2.reason}"`, 'Low clearance was unexpectedly allowed');

  // Test Emergency Lockdown
  console.log('Toggling Emergency Lockdown on zone...');
  const lockTx = await accessSigner.toggleEmergencyLockdown(testZoneBytes32, true);
  await lockTx.wait();
  const accessCheckLocked = await chainService.canAccessZoneOnChain({
    walletAddress: testWallet,
    zoneId: testZoneId,
  });
  assert(accessCheckLocked.allowed === false, `Emergency lockdown correctly blocks access: "${accessCheckLocked.reason}"`, 'Lockdown failed to block access');

  // Unlock zone
  const unlockTx = await accessSigner.toggleEmergencyLockdown(testZoneBytes32, false);
  await unlockTx.wait();
  pass('Zone unlocked successfully');

  // --- 4. AssetNFT.sol (#89) Soulbound Custody Token Tests ---
  console.log('\n--- Phase 4: AssetNFT.sol (#89) Soulbound Custody Tests ---');
  const recipientWallet = ethers.Wallet.createRandom().address;
  await (await chainService.registerIdentityOnChain({
    walletAddress: recipientWallet,
    did: `did:beltal:RECP-${ts % 10000}`,
    identityHash: ethers.keccak256(ethers.toUtf8Bytes('RECP_USER')),
    clearanceLevel: 3,
    sbu: 'SBU_RADAR',
  })).confirmed;

  console.log(`Minting Soulbound Defence Hardware NFT to ${testWallet}...`);
  const mintResult = await chainService.mintAssetOnChain({
    custodianWallet: testWallet,
    assetTag: `BEL-SDR-${ts % 10000}`,
    serialNumber: `SN-TEST-${ts}`,
    classificationTier: 3,
    sbu: 'SBU_RADAR',
    ipfsCid: 'QmTestFullSuiteCid1234567890',
  });

  assert(mintResult.confirmed === true, `Asset minted on Sepolia: Token #${mintResult.tokenId} (Tx: ${mintResult.txHash})`, 'Mint failed');

  console.log(`Reading on-chain asset details for Token #${mintResult.tokenId}...`);
  const onChainAsset = await chainService.getAssetOnChain(mintResult.tokenId);
  assert(onChainAsset.found === true, 'getAssetOnChain retrieved details', 'Asset details not found on-chain');
  assert(onChainAsset.custodian.toLowerCase() === testWallet.toLowerCase(), 'On-chain custodian matches initial custodian', 'Custodian mismatch');
  assert(onChainAsset.classificationTier === 3, 'On-chain classification tier is Level 3', 'Tier mismatch');

  console.log(`Reassigning custody of Token #${mintResult.tokenId} to ${recipientWallet}...`);
  const xferResult = await chainService.reassignCustodyOnChain({
    tokenId: mintResult.tokenId,
    newCustodianWallet: recipientWallet,
    reason: 'AUTHORIZED_MAINTENANCE_HANDOVER',
  });
  assert(xferResult.confirmed === true, `Custody reassigned on Sepolia (Tx: ${xferResult.txHash})`, 'Reassignment failed');

  const onChainAssetAfter = await chainService.getAssetOnChain(mintResult.tokenId);
  assert(onChainAssetAfter.custodian.toLowerCase() === recipientWallet.toLowerCase(), 'On-chain custodian updated to new recipient', 'Custodian was not updated');

  // Verify soulbound transferFrom revert
  const assetWithSigner = chainService.getAssetContract(true);
  try {
    await assetWithSigner.transferFrom(recipientWallet, testWallet, BigInt(mintResult.tokenId));
    fail('Soulbound transferFrom did not revert');
  } catch (err) {
    pass(`Soulbound transferFrom correctly reverted: "${err.message.slice(0, 70)}..."`);
  }

  // --- 5. AuditLog.sol (#86) Unified Log Stream Tests ---
  console.log('\n--- Phase 5: AuditLog.sol (#86) Unified Log Stream Tests ---');
  const logCount = await auditContract.getLogCount();
  assert(Number(logCount) > 0, `AuditLog has ${logCount} immutable on-chain security entries`, 'AuditLog has zero entries');

  const latestLog = await auditContract.getLog(Number(logCount) - 1);
  assert(Boolean(latestLog.eventType), `Latest log eventType: ${ethers.decodeBytes32String(latestLog.eventType)}`, 'Invalid log entry');
  console.log(`  Latest On-Chain Event: ${ethers.decodeBytes32String(latestLog.eventType)} | Details: "${latestLog.details}"`);

  // --- 6. Anti-Tamper End-to-End Test (#87 / #47) ---
  console.log('\n--- Phase 6: Anti-Tamper End-to-End Verification ---');
  const { user: registeredEmployee } = await identityService.registerIdentity({
    walletAddress: ethers.Wallet.createRandom().address,
    externalId: `EMP-FULL-${ts}`,
    fullName: 'Chief Scientist DRDO/BEL',
    displayName: 'Chief Scientist',
    sbu: 'SBU_RADAR',
    clearanceLevel: 4,
    role: 'ADMIN',
  });
  cleanupUserIds.push(registeredEmployee.id);

  const tamperReport = await tamperService.verifyIdentityIntegrity(registeredEmployee.id);
  assert(tamperReport.verdict === 'INTEGRITY_OK', `Identity integrity verdict: ${tamperReport.verdict}`, 'Identity integrity failed');

  const onChainCheck = tamperReport.verifications.find((v) => v.check === 'ON_CHAIN_IDENTITY_REGISTRY');
  assert(
    onChainCheck && onChainCheck.status === 'ON_CHAIN_HASH_MATCH',
    'Anti-tamper report verified on-chain against live Sepolia IdentityRegistry!',
    `On-chain identity check status: ${onChainCheck?.status}`
  );

  await cleanup();
  console.log(`\n================================================================`);
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('[Fatal Error]', err);
  await cleanup().catch(() => {});
  process.exit(1);
});
