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

async function runAssetTests() {
  console.log('=== Starting TrustChain Asset Minting & Retrieval Verification Suite ===\n');
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
    // 1. Seed Test Users in PostgreSQL Cache
    console.log('[Setup] Creating test users with different clearance levels and roles...');

    const adminWallet = ethers.Wallet.createRandom().address;
    const adminUser = await prisma.user.create({
      data: {
        walletAddress: adminWallet,
        externalId: 'BEL-CISO-' + Math.floor(Math.random() * 10000),
        displayName: 'CISO Admin',
        role: 'ADMIN',
        clearanceLevel: 4,
        sbu: 'SBU_CYBER',
        identityHash: '0x' + '11'.repeat(32),
        identitySalt: 'salt-admin',
      },
    });

    const engineerL2Wallet = ethers.Wallet.createRandom().address;
    const engineerL2 = await prisma.user.create({
      data: {
        walletAddress: engineerL2Wallet,
        externalId: 'BEL-ENG-L2-' + Math.floor(Math.random() * 10000),
        displayName: 'Junior Radar Engineer',
        role: 'USER',
        clearanceLevel: 2,
        sbu: 'SBU_RADAR',
        identityHash: '0x' + '22'.repeat(32),
        identitySalt: 'salt-l2',
      },
    });

    const scientistL4Wallet = ethers.Wallet.createRandom().address;
    const scientistL4 = await prisma.user.create({
      data: {
        walletAddress: scientistL4Wallet,
        externalId: 'BEL-SCI-L4-' + Math.floor(Math.random() * 10000),
        displayName: 'Senior Radar Scientist',
        role: 'USER',
        clearanceLevel: 4,
        sbu: 'SBU_RADAR',
        identityHash: '0x' + '33'.repeat(32),
        identitySalt: 'salt-l4',
      },
    });

    const auditorWallet = ethers.Wallet.createRandom().address;
    const auditorUser = await prisma.user.create({
      data: {
        walletAddress: auditorWallet,
        externalId: 'BEL-AUDIT-' + Math.floor(Math.random() * 10000),
        displayName: 'DGQA Auditor',
        role: 'AUDITOR',
        clearanceLevel: 4,
        sbu: 'SBU_CYBER',
        identityHash: '0x' + '44'.repeat(32),
        identitySalt: 'salt-auditor',
      },
    });

    const adminToken = generateToken(adminUser);
    const engineerToken = generateToken(engineerL2);
    const scientistToken = generateToken(scientistL4);
    const auditorToken = generateToken(auditorUser);

    // ----------------------------------------------------
    // TEST 1: Mint Asset by Admin (Happy Path)
    // ----------------------------------------------------
    console.log('\n--- Test 1: Mint Asset by Admin (Happy Path) ---');
    const assetTag1 = 'BEL-SDR-TAC-' + Math.floor(Math.random() * 10000);
    const mintRes1 = await fetch(`${baseUrl}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Tactical Software-Defined Radio',
        classificationTier: 3,
        sbu: 'SBU_RADAR',
        ownerId: scientistL4.id,
        metadata: {
          assetTag: assetTag1,
          serialNumber: 'SN-SDR-' + Math.floor(Math.random() * 100000),
          frequencyRange: '30 MHz - 512 MHz',
          militaryStandard: 'MIL-STD-810G',
        },
      }),
    });

    const mintData1 = await mintRes1.json();
    assert(mintRes1.status === 201, 'POST /assets returns 201 Created');
    assert(mintData1.success === true, 'Response contains success: true');
    assert(typeof mintData1.data.cid === 'string' && mintData1.data.cid.startsWith('Qm'), 'Asset metadata pinned to IPFS (CID returned)');
    assert(mintData1.data.classificationTier === 3, 'Asset classificationTier is correctly stored as 3');
    assert(mintData1.data.sbu === 'SBU_RADAR', 'Asset is tagged with owning SBU');
    assert(mintData1.data.owner.id === scientistL4.id, 'Asset custody is assigned to target scientist');

    const mintedAssetId = mintData1.data.id;

    // Check AuditEvent creation in DB
    const auditEvents = await prisma.auditEvent.findMany({ where: { targetId: mintedAssetId } });
    assert(auditEvents.length > 0 && auditEvents[0].type === 'ASSET_MINTED', 'AuditEvent of type ASSET_MINTED created in PostgreSQL');

    // ----------------------------------------------------
    // TEST 2: Mint Asset with Insufficient Custodian Clearance (Unhappy Path)
    // ----------------------------------------------------
    console.log('\n--- Test 2: Clearance Gate Enforcement (L2 User cannot receive Tier 3 Asset) ---');
    const mintRes2 = await fetch(`${baseUrl}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'High-Power Radar Signal Processor',
        classificationTier: 3,
        sbu: 'SBU_RADAR',
        ownerId: engineerL2.id, // Engineer has Level 2, Asset requires Level 3!
        metadata: {
          assetTag: 'BEL-RSP-999',
        },
      }),
    });

    const mintData2 = await mintRes2.json();
    assert(mintRes2.status === 400, 'POST /assets with insufficient clearance returns 400 Bad Request');
    assert(
      mintData2.error.message.includes('insufficient'),
      'Error message explains clearance insufficiency'
    );

    // ----------------------------------------------------
    // TEST 3: Mint Asset by regular USER (Unauthorized)
    // ----------------------------------------------------
    console.log('\n--- Test 3: Unauthorized Minting by regular USER ---');
    const mintRes3 = await fetch(`${baseUrl}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${engineerToken}`,
      },
      body: JSON.stringify({
        name: 'Unauthorized Tool',
        classificationTier: 1,
        sbu: 'SBU_RADAR',
      }),
    });
    assert(mintRes3.status === 403, 'POST /assets by non-admin/manager returns 403 Forbidden');

    // ----------------------------------------------------
    // TEST 4: List Custody Assets (GET /api/assets/me)
    // ----------------------------------------------------
    console.log('\n--- Test 4: List Personal Custody Assets (GET /api/assets/me) ---');
    // Scientist should see the asset minted in Test 1
    const myAssetsRes = await fetch(`${baseUrl}/assets/me`, {
      headers: { Authorization: `Bearer ${scientistToken}` },
    });
    const myAssetsData = await myAssetsRes.json();
    assert(myAssetsRes.status === 200, 'GET /assets/me returns 200 OK');
    assert(Array.isArray(myAssetsData.data), 'Returns an array of custody assets');
    const foundAsset = myAssetsData.data.find((a) => a.id === mintedAssetId);
    assert(Boolean(foundAsset), 'Scientist sees the newly minted asset in their personal custody');

    // Engineer should have empty custody locker
    const engAssetsRes = await fetch(`${baseUrl}/assets/me`, {
      headers: { Authorization: `Bearer ${engineerToken}` },
    });
    const engAssetsData = await engAssetsRes.json();
    assert(engAssetsData.data.length === 0, 'Engineer has 0 assets in custody');

    // ----------------------------------------------------
    // TEST 5: Fetch One Asset with Custody History (GET /api/assets/:id)
    // ----------------------------------------------------
    console.log('\n--- Test 5: Fetch Single Asset with Custody History ---');
    const singleAssetRes = await fetch(`${baseUrl}/assets/${mintedAssetId}`, {
      headers: { Authorization: `Bearer ${engineerToken}` },
    });
    const singleAssetData = await singleAssetRes.json();
    assert(singleAssetRes.status === 200, 'GET /assets/:id returns 200 OK');
    assert(singleAssetData.data.id === mintedAssetId, 'Returns matching asset ID');
    assert(Array.isArray(singleAssetData.data.custodyHistory), 'Returns custodyHistory array');
    assert(
      singleAssetData.data.custodyHistory[0].event === 'MINTED_AND_ASSIGNED',
      'Custody history reflects initial MINTED_AND_ASSIGNED event'
    );
    assert(Array.isArray(singleAssetData.data.auditLogs), 'Returns auditLogs array');

    // ----------------------------------------------------
    // TEST 6: List & Search All Assets (Admin / Auditor)
    // ----------------------------------------------------
    console.log('\n--- Test 6: List & Filter Assets (GET /api/assets) ---');
    // Auditor lists assets in SBU_RADAR
    const listRes = await fetch(`${baseUrl}/assets?sbu=SBU_RADAR&classificationTier=3`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    const listData = await listRes.json();
    assert(listRes.status === 200, 'GET /assets by Auditor returns 200 OK');
    assert(Array.isArray(listData.data), 'Returns data array');
    assert(listData.pagination && typeof listData.pagination.total === 'number', 'Returns pagination metadata');
    assert(
      listData.data.some((a) => a.id === mintedAssetId),
      'Filtered query includes the SBU_RADAR Tier 3 asset'
    );

    // Regular USER cannot call GET /api/assets
    const userListRes = await fetch(`${baseUrl}/assets`, {
      headers: { Authorization: `Bearer ${engineerToken}` },
    });
    assert(userListRes.status === 403, 'GET /assets by regular USER returns 403 Forbidden');

  } catch (err) {
    console.error('Error in asset verification test suite:', err);
    failed++;
  } finally {
    await stopServer();
  }

  console.log(`\n=== Verification Results: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAssetTests();
