import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import config from '../src/config/env.js';
import ipfsService from '../src/services/ipfs.service.js';
import http from 'http';

async function runTest() {
  console.log('--- Testing Pinata IPFS & Admin Identity Registration Flow ---\n');

  // Step 1: Test Direct IPFS Pinning
  console.log('[Step 1] Testing direct Pinata pinJson...');
  try {
    const testPayload = {
      testMessage: 'TrustChain IPFS Connection Test',
      timestamp: new Date().toISOString(),
      service: 'BELTAL Defence Systems',
    };
    const cid = await ipfsService.pinJson(testPayload, { name: 'trustchain-test-pin' });
    console.log(`[PASS] Pinata IPFS Pinning successful! CID: ${cid}`);
    console.log(`[INFO] Gateway URL: ${config.pinataGateway}/${cid}`);
  } catch (err) {
    console.error(`[FAIL] Direct Pinata IPFS pin failed: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Test End-to-End Admin Identity Registration
  console.log('\n[Step 2] Testing End-to-End Admin Registration API Flow...');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  try {
    const adminToken = jwt.sign(
      {
        sub: 'admin-tester-id',
        walletAddress: '0x1111111111111111111111111111111111111111',
        role: 'ADMIN',
        clearanceLevel: 4,
        sbu: 'SBU_CYBER',
        isRegistered: true,
      },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    const testEmpWallet = ethers.Wallet.createRandom().address;
    const testEmpId = 'BEL-VERIFY-' + Math.floor(Math.random() * 100000);

    console.log(`Attempting registration for ${testEmpId} (${testEmpWallet})...`);

    const response = await fetch(`${baseUrl}/admin/identities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        walletAddress: testEmpWallet,
        externalId: testEmpId,
        fullName: 'Dr. A. P. J. Abdul Kalam',
        displayName: 'Dr. APJ Abdul Kalam',
        role: 'USER',
        clearanceLevel: 4,
        sbu: 'SBU_RADAR',
        piiDossier: {
          division: 'Avionics and Missile Guidance',
          station: 'Bengaluru Unit',
          clearanceType: 'TOP_SECRET_CODENAME_AGNI',
        },
      }),
    });

    const data = await response.json();

    if (response.status === 201 && data.success) {
      console.log('[PASS] Admin registration succeeded with status 201 Created!');
      console.log('User Record in PostgreSQL Cache:');
      console.log(` - ID: ${data.data.id}`);
      console.log(` - Employee Code: ${data.data.externalId}`);
      console.log(` - Identity Hash: ${data.data.identityHash}`);
      console.log(` - Dossier CID: ${data.data.dossierCid}`);
      console.log(` - Role: ${data.data.role}`);
      console.log(` - Clearance Level: ${data.data.clearanceLevel}`);
      console.log('\n--- All Pinata IPFS & Registration Tests Passed Successfully! ---');
    } else {
      console.error(`[FAIL] Registration failed (${response.status}):`, JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (err) {
    console.error('Error in API verification test:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTest();
