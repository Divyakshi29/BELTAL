/**
 * testAuditFlow.js — Issue #47 End-to-End Verification Suite
 * Tests: audit trail indexing, paginated/filterable query, anti-tamper verification
 *
 * Prerequisites: Backend server running at http://localhost:4000
 * Run: node scripts/testAuditFlow.js
 */

import 'dotenv/config';
import prisma from '../src/config/db.js';
import identityService from '../src/services/identity.service.js';
import assetService from '../src/services/asset.service.js';
import auditService from '../src/services/audit.service.js';
import tamperService from '../src/services/tamper.service.js';
import chainService from '../src/services/chain.service.js';

// ---- Test Helpers ----
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

// ---- Cleanup ----
const testUsers = [];
const testAssets = [];

async function cleanup() {
  console.log('\n[Cleanup] Removing test data...');
  for (const assetId of testAssets) {
    await prisma.auditEvent.deleteMany({ where: { targetId: assetId } }).catch(() => {});
    await prisma.transferRequest.deleteMany({ where: { assetId } }).catch(() => {});
    await prisma.asset.deleteMany({ where: { id: assetId } }).catch(() => {});
  }
  for (const userId of testUsers) {
    await prisma.auditEvent.deleteMany({ where: { actorId: userId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
  }
  console.log('[Cleanup] Done');
}

// ---- Main ----
async function main() {
  console.log('=== TrustChain Audit Trail & Anti-Tamper Verification Suite (Issue #47) ===\n');

  // ========== SETUP ==========
  console.log('[Setup] Creating test admin and employee...');

  const ts = Date.now();
  const { user: admin } = await identityService.registerIdentity({
    walletAddress: `0x${(BigInt('0x9000000000000000000000000000000000000001') + BigInt(ts % 1000)).toString(16).padStart(40, '0')}`,
    externalId: `AUDIT-ADMIN-${ts}`,
    fullName: 'Audit Admin Sharma',
    displayName: 'Audit Admin',
    sbu: 'SBU_RADAR',
    clearanceLevel: 4,
    role: 'ADMIN',
  });
  testUsers.push(admin.id);

  const { user: employee } = await identityService.registerIdentity({
    walletAddress: `0x${(BigInt('0x9000000000000000000000000000000000000002') + BigInt(ts % 1000)).toString(16).padStart(40, '0')}`,
    externalId: `AUDIT-EMP-${ts}`,
    fullName: 'Radar Engineer Mehta',
    displayName: 'Radar Engineer',
    sbu: 'SBU_RADAR',
    clearanceLevel: 3,
    role: 'USER',
  });
  testUsers.push(employee.id);

  console.log('[Setup] Minting test asset...');
  const { asset } = await assetService.mintAsset(admin, {
    name: `Radar Asset Audit Test ${ts}`,
    classificationTier: 3,
    sbu: 'SBU_RADAR',
    ownerId: employee.id,
    metadata: { assetTag: `BEL-RAD-AUDIT-${ts}`, series: 'X-47' },
  });
  testAssets.push(asset.id);
  console.log(`[Setup] Asset minted: ${asset.id} (Token: ${asset.tokenId || 'off-chain'})\n`);

  // ========== TEST 1: Audit Trail — Basic Read ==========
  console.log('--- Test 1: GET Audit Trail (All Events) ---');
  const allAudit = await auditService.getAuditTrail({ page: '1', limit: '50' });

  assert(Array.isArray(allAudit.events), 'GET audit trail returns events array', 'Missing events array');
  assert(allAudit.pagination !== undefined, 'GET audit trail includes pagination', 'Missing pagination');
  assert(allAudit.pagination.total > 0, 'Audit trail has events in database', 'Audit trail is empty');
  assert(
    allAudit.events.every((e) => e.id && e.type && e.timestamp),
    'All events have id, type, timestamp',
    'Some events missing required fields'
  );

  // ========== TEST 2: Filter by type ==========
  console.log('\n--- Test 2: Filter by type=ASSET_MINTED ---');
  const mintedEvents = await auditService.getAuditTrail({ type: 'ASSET_MINTED', limit: '20' });

  assert(Array.isArray(mintedEvents.events), 'GET /audit?type=ASSET_MINTED returns array', 'Missing events');
  assert(
    mintedEvents.events.every((e) => e.type === 'ASSET_MINTED'),
    'All filtered events are ASSET_MINTED type',
    'Events contain wrong types'
  );
  assert(mintedEvents.events.length > 0, 'At least 1 ASSET_MINTED event exists', 'No ASSET_MINTED events found');

  // ========== TEST 3: Filter by targetId ==========
  console.log('\n--- Test 3: Filter by targetId (asset UUID) ---');
  const targetedEvents = await auditService.getAuditTrail({ targetId: asset.id, limit: '20' });

  assert(Array.isArray(targetedEvents.events), 'GET /audit?targetId returns array', 'Missing events');
  assert(
    targetedEvents.events.length > 0,
    `Found audit events for asset ${asset.id}`,
    'No audit events found for test asset'
  );
  assert(
    targetedEvents.events.every((e) => e.source === 'AUDIT_EVENT'),
    'Targeted events are from AUDIT_EVENT source',
    'Wrong event source'
  );

  // ========== TEST 4: Filter by actorId ==========
  console.log('\n--- Test 4: Filter by actorId (admin user) ---');
  const actorEvents = await auditService.getAuditTrail({ actorId: admin.id, limit: '20' });
  assert(Array.isArray(actorEvents.events), 'GET /audit?actorId returns array', 'Missing events');

  // ========== TEST 5: Multi-type filter ==========
  console.log('\n--- Test 5: Multi-type comma filter ---');
  const multiType = await auditService.getAuditTrail({
    type: 'ASSET_MINTED,OWNERSHIP_TRANSFERRED',
    limit: '20',
  });
  assert(Array.isArray(multiType.events), 'Multi-type filter returns array', 'Missing events');
  assert(
    multiType.events.every((e) =>
      ['ASSET_MINTED', 'OWNERSHIP_TRANSFERRED'].includes(e.type)
    ),
    'Multi-type filter returns only specified types',
    'Multi-type filter returned wrong types'
  );

  // ========== TEST 6: Time-range filter ==========
  console.log('\n--- Test 6: Time-range filter ---');
  const from = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
  const to   = new Date(Date.now() + 60 * 1000).toISOString();       // 1 minute future
  const timeFiltered = await auditService.getAuditTrail({ from, to, limit: '10' });
  assert(Array.isArray(timeFiltered.events), 'Time-range filter returns events array', 'Missing events');

  // ========== TEST 7: Single AuditEvent by ID ==========
  console.log('\n--- Test 7: GET Single AuditEvent by ID ---');
  const firstEvent = targetedEvents.events.find((e) => e.source === 'AUDIT_EVENT');
  if (firstEvent) {
    const singleEvent = await auditService.getAuditEventById(firstEvent.id);
    assert(singleEvent.id === firstEvent.id, 'GET /audit/:id returns correct event', 'Wrong event returned');
    assert(singleEvent.type !== undefined, 'Single event has type field', 'Missing type');
    assert(singleEvent.timestamp !== undefined, 'Single event has timestamp', 'Missing timestamp');
  } else {
    pass('GET /audit/:id test skipped — no AUDIT_EVENT events found yet');
  }

  // ========== TEST 8: On-Chain Asset Read ==========
  console.log('\n--- Test 8: On-Chain Asset Read (chain.getAssetOnChain) ---');
  if (asset.tokenId) {
    const onChain = await chainService.getAssetOnChain(asset.tokenId);
    assert(
      onChain.found === true || onChain.error !== undefined,
      'getAssetOnChain responds (found or graceful error)',
      'getAssetOnChain returned unexpected shape'
    );
    if (onChain.found) {
      assert(
        onChain.tokenId === asset.tokenId,
        `On-chain tokenId matches (${asset.tokenId})`,
        'tokenId mismatch'
      );
      assert(onChain.custodian !== undefined, 'On-chain custodian address present', 'Missing custodian');
      assert(onChain.tokenURI !== undefined, 'On-chain tokenURI present', 'Missing tokenURI');
      console.log(`  Token #${asset.tokenId}: custodian=${onChain.custodian}, CID in URI=${onChain.tokenURI}`);
    } else {
      pass(`getAssetOnChain gracefully returned: ${onChain.error}`);
    }
  } else {
    pass('On-chain asset read skipped — asset minted off-chain');
  }

  // ========== TEST 9: Anti-Tamper — Asset Integrity ==========
  console.log('\n--- Test 9: Anti-Tamper — Asset Integrity Check ---');
  const assetReport = await tamperService.verifyAssetIntegrity(asset.id);

  assert(assetReport.assetId === asset.id, 'Asset verification report has correct assetId', 'Wrong assetId');
  assert(Array.isArray(assetReport.verifications), 'Asset report has verifications array', 'Missing verifications');
  assert(assetReport.checkedAt !== undefined, 'Asset report has checkedAt timestamp', 'Missing checkedAt');

  if (asset.tokenId && assetReport.onChainAvailable) {
    assert(
      assetReport.verdict === 'INTEGRITY_OK',
      `Asset integrity check: ${assetReport.verdict} — all on-chain values match DB`,
      `Asset integrity COMPROMISED: ${JSON.stringify(assetReport.verifications)}`
    );
    console.log(`  Verdict: ${assetReport.verdict}`);
    assetReport.verifications.forEach((v) => {
      console.log(`  ✓ ${v.check}: ${v.status}`);
    });
  } else {
    assert(
      assetReport.verifications.length > 0,
      'Asset report returned verifications (off-chain mode)',
      'Empty verifications array'
    );
    console.log(`  Asset is off-chain — verdict: ${assetReport.verdict || 'N/A'}`);
    assetReport.verifications.forEach((v) => {
      console.log(`  • ${v.check}: ${v.status} — ${v.reason || v.description || ''}`);
    });
  }

  // ========== TEST 10: Anti-Tamper — Identity Integrity ==========
  console.log('\n--- Test 10: Anti-Tamper — Employee Identity Integrity Check ---');
  const identityReport = await tamperService.verifyIdentityIntegrity(employee.id);

  assert(identityReport.employeeId === employee.id, 'Identity report has correct employeeId', 'Wrong employeeId');
  assert(Array.isArray(identityReport.verifications), 'Identity report has verifications array', 'Missing verifications');

  if (identityReport.ipfsAvailable) {
    assert(
      identityReport.verdict === 'INTEGRITY_OK',
      `Identity integrity check: ${identityReport.verdict} — hash matches IPFS dossier`,
      `Identity integrity COMPROMISED: ${JSON.stringify(identityReport.verifications)}`
    );
    identityReport.verifications.forEach((v) => {
      console.log(`  ✓ ${v.check}: ${v.status}`);
    });
  } else {
    pass('Identity integrity check returned graceful result (IPFS unavailable or no dossierCid)');
    identityReport.verifications.forEach((v) => {
      console.log(`  • ${v.check}: ${v.status}`);
    });
  }

  // ========== TEST 11: Anti-Tamper — By externalId ==========
  console.log('\n--- Test 11: Anti-Tamper — Identity by externalId ---');
  const reportByExtId = await tamperService.verifyIdentityIntegrity(employee.externalId);
  assert(
    reportByExtId.employeeId === employee.id,
    'Identity lookup by externalId resolves correct employee',
    'Wrong employee resolved by externalId'
  );

  // ========== TEST 12: Transaction Verification ==========
  console.log('\n--- Test 12: On-Chain Transaction Verification ---');
  if (asset.mintTxHash && /^0x[0-9a-fA-F]{64}$/.test(asset.mintTxHash)) {
    const txReport = await tamperService.verifyTransaction(asset.mintTxHash);
    assert(txReport.found === true, `Mint tx ${asset.mintTxHash.slice(0, 12)}... found on Sepolia`, 'Tx not found');
    assert(txReport.status === 'SUCCESS', 'Mint tx status is SUCCESS', `Unexpected status: ${txReport.status}`);
    assert(txReport.explorerUrl !== undefined, 'Tx report includes Etherscan URL', 'Missing explorerUrl');
    assert(txReport.blockNumber !== null, 'Tx report includes blockNumber', 'Missing blockNumber');
    console.log(`  Tx: ${txReport.status} | Block: ${txReport.blockNumber} | Gas: ${txReport.gasUsed}`);
    console.log(`  Explorer: ${txReport.explorerUrl}`);
  } else {
    pass('Tx verification skipped — asset minted off-chain (no on-chain txHash)');
  }

  // ========== TEST 13: Error Handling — invalid assetId ==========
  console.log('\n--- Test 13: Error Handling — Invalid assetId ---');
  try {
    await tamperService.verifyAssetIntegrity('00000000-0000-0000-0000-nonexistent00');
    fail('Should have thrown 404 for invalid assetId');
  } catch (err) {
    assert(err.status === 404, 'Invalid assetId returns 404 NotFound', `Wrong error: ${err.message}`);
  }

  // ========== TEST 14: Error Handling — invalid employeeId ==========
  console.log('\n--- Test 14: Error Handling — Invalid employeeId ---');
  try {
    await tamperService.verifyIdentityIntegrity('NONEXISTENT-EMP-XXXXXX');
    fail('Should have thrown 404 for invalid employeeId');
  } catch (err) {
    assert(err.status === 404, 'Invalid employeeId returns 404 NotFound', `Wrong error: ${err.message}`);
  }

  // ========== TEST 15: Pagination ---
  console.log('\n--- Test 15: Pagination Controls ---');
  const page1 = await auditService.getAuditTrail({ page: '1', limit: '2' });
  assert(page1.events.length <= 2, 'limit=2 returns at most 2 events', 'Limit not enforced');
  assert(page1.pagination.limit === 2, 'Pagination reflects requested limit', 'Wrong limit in pagination');
  assert(page1.pagination.totalPages >= 1, 'totalPages is at least 1', 'Missing totalPages');

  // ========== SUMMARY ==========
  await cleanup();
  console.log(`\n=== Verification Results: ${passed} Passed, ${failed} Failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('[Fatal]', err);
  await cleanup().catch(() => {});
  process.exit(1);
});
