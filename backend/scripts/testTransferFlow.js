import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import http from 'http';
import app from '../src/app.js';
import config from '../src/config/env.js';
import prisma from '../src/config/db.js';

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}/api`;
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
      clearanceLevel: user.clearanceLevel,
      sbu: user.sbu,
      isRegistered: true,
    },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
}

async function runTransferTests() {
  console.log('=== Starting TrustChain Asset Transfer Flow Verification Suite (Issue #46) ===\n');
  await startServer();

  let passed = 0;
  let failed = 0;

  function assert(condition, description) {
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}`);
      failed++;
    }
  }

  try {
    // 1. Setup Test Personnel
    console.log('[Setup] Creating test users across SBUs and clearance levels...');

    const managerUser = await prisma.user.create({
      data: {
        walletAddress: ethers.Wallet.createRandom().address,
        externalId: 'BEL-MGR-' + Math.floor(Math.random() * 100000),
        displayName: 'Radar SBU Lead',
        role: 'MANAGER',
        clearanceLevel: 4,
        sbu: 'SBU_RADAR',
        identityHash: '0x' + 'aa'.repeat(32),
        identitySalt: 'salt-mgr',
      },
    });

    const scientistRadarL4 = await prisma.user.create({
      data: {
        walletAddress: ethers.Wallet.createRandom().address,
        externalId: 'BEL-RADAR-L4-' + Math.floor(Math.random() * 100000),
        displayName: 'Senior Radar Scientist (L4)',
        role: 'USER',
        clearanceLevel: 4,
        sbu: 'SBU_RADAR',
        identityHash: '0x' + 'bb'.repeat(32),
        identitySalt: 'salt-sci',
      },
    });

    const engineerRadarL2 = await prisma.user.create({
      data: {
        walletAddress: ethers.Wallet.createRandom().address,
        externalId: 'BEL-RADAR-L2-' + Math.floor(Math.random() * 100000),
        displayName: 'Junior Radar Tech (L2)',
        role: 'USER',
        clearanceLevel: 2,
        sbu: 'SBU_RADAR',
        identityHash: '0x' + 'cc'.repeat(32),
        identitySalt: 'salt-tech',
      },
    });

    const engineerMilCommL4 = await prisma.user.create({
      data: {
        walletAddress: ethers.Wallet.createRandom().address,
        externalId: 'BEL-MILCOMM-L4-' + Math.floor(Math.random() * 100000),
        displayName: 'MilComm Avionics Engineer (L4)',
        role: 'USER',
        clearanceLevel: 4,
        sbu: 'SBU_MILCOMM',
        identityHash: '0x' + 'dd'.repeat(32),
        identitySalt: 'salt-milcomm',
      },
    });

    const managerToken = generateToken(managerUser);
    const scientistToken = generateToken(scientistRadarL4);
    const engineerL2Token = generateToken(engineerRadarL2);
    const milCommToken = generateToken(engineerMilCommL4);

    // 2. Mint Test Asset in SBU_RADAR (Classification Tier 3)
    console.log('[Setup] Minting test Tier 3 asset in SBU_RADAR...');
    const mintRes = await fetch(`${baseUrl}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        name: 'Tactical EW Jamming Module',
        classificationTier: 3,
        sbu: 'SBU_RADAR',
        ownerId: scientistRadarL4.id,
        metadata: {
          assetTag: 'BEL-JAM-TAC-' + Math.floor(Math.random() * 10000),
          serialNumber: 'SN-JAM-998',
        },
      }),
    });
    const mintData = await mintRes.json();
    const assetId = mintData.data.id;
    console.log(`[Setup] Asset minted successfully: ${assetId} (Custodian: ${scientistRadarL4.displayName})`);

    // ----------------------------------------------------
    // TEST 1: Non-Owner Handover Attempt (Security Gate)
    // ----------------------------------------------------
    console.log('\n--- Test 1: Non-Custodian cannot request asset handover ---');
    const stolenReqRes = await fetch(`${baseUrl}/transfers/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${engineerL2Token}`, // Doesn't hold this asset!
      },
      body: JSON.stringify({
        assetId,
        toUserId: engineerRadarL2.id,
        reason: 'Unauthorized custody takeover',
      }),
    });
    assert(stolenReqRes.status === 403, 'POST /transfers/request by non-custodian returns 403 Forbidden');

    // ----------------------------------------------------
    // TEST 2: Clearance Gate Enforcement (L2 recipient for Tier 3 asset)
    // ----------------------------------------------------
    console.log('\n--- Test 2: Clearance Gate: Recipient L2 has insufficient clearance for Tier 3 asset ---');
    const clearanceFailRes = await fetch(`${baseUrl}/transfers/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${scientistToken}`,
      },
      body: JSON.stringify({
        assetId,
        toUserId: engineerRadarL2.id, // Clearance Level 2, Asset requires Level 3!
        reason: 'Handover for calibration',
      }),
    });
    const clearanceFailData = await clearanceFailRes.json();
    assert(clearanceFailRes.status === 400, 'POST /transfers/request with low clearance returns 400 Bad Request');
    assert(
      clearanceFailData.error.message.includes('insufficient'),
      'Error message details clearance insufficiency'
    );

    // ----------------------------------------------------
    // TEST 3: Cross-SBU Protection & Time-Boxed Cross-SBU Pass Flow
    // ----------------------------------------------------
    console.log('\n--- Test 3: Cross-SBU Confinement & Pass Granting Flow ---');
    // Step 3a: Attempt transfer to MilComm Engineer without active pass
    const crossSbuFailRes = await fetch(`${baseUrl}/transfers/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${scientistToken}`,
      },
      body: JSON.stringify({
        assetId,
        toUserId: engineerMilCommL4.id, // SBU_MILCOMM vs Asset SBU_RADAR
        reason: 'Cross-department joint trial',
      }),
    });
    const crossSbuFailData = await crossSbuFailRes.json();
    assert(crossSbuFailRes.status === 400, 'Cross-SBU transfer without pass returns 400 Bad Request');
    assert(
      crossSbuFailData.error.message.includes('Cross-SBU Pass is required'),
      'Error message enforces Cross-SBU pass requirement'
    );

    // Step 3b: Manager issues 48-hour Cross-SBU pass for SBU_RADAR
    console.log('Granting 48-hour Cross-SBU Pass for SBU_RADAR to MilComm Engineer...');
    const grantPassRes = await fetch(`${baseUrl}/passes/cross-sbu`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        userId: engineerMilCommL4.id,
        targetSbu: 'SBU_RADAR',
        durationHours: 48,
        reason: 'Authorized joint electronic warfare field integration',
      }),
    });
    const grantPassData = await grantPassRes.json();
    assert(grantPassRes.status === 201, 'POST /passes/cross-sbu returns 201 Created');
    assert(grantPassData.data.targetSbu === 'SBU_RADAR', 'Pass granted for target SBU_RADAR');

    // Step 3c: Re-attempt transfer request with active pass (Should Succeed!)
    const crossSbuSuccessRes = await fetch(`${baseUrl}/transfers/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${scientistToken}`,
      },
      body: JSON.stringify({
        assetId,
        toUserId: engineerMilCommL4.id,
        reason: 'Joint electronic warfare trial under pass',
      }),
    });
    const crossSbuSuccessData = await crossSbuSuccessRes.json();
    assert(crossSbuSuccessRes.status === 201, 'POST /transfers/request with active pass returns 201 Created');
    assert(crossSbuSuccessData.data.status === 'PENDING', 'Transfer request created with status PENDING');

    const transferRequestId = crossSbuSuccessData.data.id;

    // Check AuditEvent: TRANSFER_REQUESTED
    const reqAudit = await prisma.auditEvent.findFirst({
      where: { type: 'TRANSFER_REQUESTED', targetId: assetId },
    });
    assert(Boolean(reqAudit), 'AuditEvent TRANSFER_REQUESTED created in PostgreSQL');

    // ----------------------------------------------------
    // TEST 4: List Transfers (Incoming & Outgoing Filtering)
    // ----------------------------------------------------
    console.log('\n--- Test 4: List Transfer Requests ---');
    // Scientist sees outgoing request
    const outgoingRes = await fetch(`${baseUrl}/transfers?type=outgoing`, {
      headers: { Authorization: `Bearer ${scientistToken}` },
    });
    const outgoingData = await outgoingRes.json();
    assert(outgoingRes.status === 200, 'GET /transfers?type=outgoing returns 200 OK');
    assert(
      outgoingData.data.some((tr) => tr.id === transferRequestId),
      'Scientist sees the pending outgoing transfer request'
    );

    // MilComm Engineer sees incoming request
    const incomingRes = await fetch(`${baseUrl}/transfers?type=incoming`, {
      headers: { Authorization: `Bearer ${milCommToken}` },
    });
    const incomingData = await incomingRes.json();
    assert(incomingRes.status === 200, 'GET /transfers?type=incoming returns 200 OK');
    assert(
      incomingData.data.some((tr) => tr.id === transferRequestId),
      'MilComm Engineer sees the pending incoming transfer request'
    );

    // ----------------------------------------------------
    // TEST 5: Manager Approves & Executes Custody Handover
    // ----------------------------------------------------
    console.log('\n--- Test 5: Manager Approval & Execution ---');
    const approveRes = await fetch(`${baseUrl}/transfers/${transferRequestId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    const approveData = await approveRes.json();
    assert(approveRes.status === 200, 'POST /transfers/:id/approve returns 200 OK');
    assert(approveData.data.status === 'EXECUTED', 'Transfer status updated to EXECUTED');
    assert(approveData.data.approvedBy.id === managerUser.id, 'ApprovedBy recorded as Manager');

    // Verify Asset owner in DB is now MilComm Engineer
    const updatedAsset = await prisma.asset.findUnique({ where: { id: assetId } });
    assert(updatedAsset.ownerId === engineerMilCommL4.id, 'Asset ownerId updated to MilComm Engineer in PostgreSQL cache');

    // Verify AuditEvent: OWNERSHIP_TRANSFERRED
    const xferAudit = await prisma.auditEvent.findFirst({
      where: { type: 'OWNERSHIP_TRANSFERRED', targetId: assetId },
    });
    assert(Boolean(xferAudit), 'AuditEvent OWNERSHIP_TRANSFERRED created in PostgreSQL');

    // ----------------------------------------------------
    // TEST 6: Transfer Rejection Flow
    // ----------------------------------------------------
    console.log('\n--- Test 6: Rejection Flow ---');
    // MilComm engineer requests transfer back to Scientist
    const req2Res = await fetch(`${baseUrl}/transfers/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${milCommToken}`,
      },
      body: JSON.stringify({
        assetId,
        toUserId: scientistRadarL4.id,
        reason: 'Handover back to Radar',
      }),
    });
    const req2Data = await req2Res.json();
    const req2Id = req2Data.data.id;

    // Manager rejects
    const rejectRes = await fetch(`${baseUrl}/transfers/${req2Id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({ reason: 'Maintenance scheduled before return' }),
    });
    const rejectData = await rejectRes.json();
    assert(rejectRes.status === 200, 'POST /transfers/:id/reject returns 200 OK');
    assert(rejectData.data.status === 'REJECTED', 'Transfer request status set to REJECTED');

    // Asset custody remains with MilComm Engineer
    const unadjustedAsset = await prisma.asset.findUnique({ where: { id: assetId } });
    assert(unadjustedAsset.ownerId === engineerMilCommL4.id, 'Asset custody remains unchanged after rejection');

    // ----------------------------------------------------
    // TEST 7: Soulbound Custody Provenance Trail (GET /api/assets/:id)
    // ----------------------------------------------------
    console.log('\n--- Test 7: Verify Asset Custody Provenance Trail ---');
    const assetDetailRes = await fetch(`${baseUrl}/assets/${assetId}`, {
      headers: { Authorization: `Bearer ${scientistToken}` },
    });
    const assetDetail = await assetDetailRes.json();
    assert(assetDetailRes.status === 200, 'GET /assets/:id returns 200 OK');
    assert(Array.isArray(assetDetail.data.custodyHistory), 'Custody history is an array');
    assert(
      assetDetail.data.custodyHistory.length >= 2,
      'Custody history reflects both MINTED_AND_ASSIGNED and CUSTODY_TRANSFERRED events'
    );
    assert(
      assetDetail.data.custodyHistory[1].event === 'CUSTODY_TRANSFERRED' &&
      assetDetail.data.custodyHistory[1].to.id === engineerMilCommL4.id,
      'Custody history accurately captures handover to MilComm Engineer'
    );

  } catch (err) {
    console.error('Error during transfer verification suite:', err);
    failed++;
  } finally {
    await stopServer();
  }

  console.log(`\n=== Verification Results: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTransferTests();
