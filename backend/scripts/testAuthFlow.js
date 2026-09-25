import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import config from '../src/config/env.js';
import http from 'http';

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}/api/auth`;
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(resolve);
    } else {
      resolve();
    }
  });
}

async function runTests() {
  console.log('--- Starting Auth Flow Automated Verification Suite ---\n');
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
    // Create random test wallet
    const testWallet = ethers.Wallet.createRandom();
    const walletAddress = testWallet.address;
    console.log(`Test Wallet generated: ${walletAddress}`);

    // TEST 1: Request Nonce (Happy Path)
    const nonceRes = await fetch(`${baseUrl}/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });
    const nonceData = await nonceRes.json();
    assert(nonceRes.status === 200, 'POST /nonce returns 200 status');
    assert(nonceData.success === true, 'POST /nonce response has success: true');
    assert(typeof nonceData.data.nonce === 'string' && nonceData.data.nonce.length > 0, 'Nonce is a valid non-empty string');
    assert(typeof nonceData.data.message === 'string' && nonceData.data.message.includes(walletAddress), 'Challenge message includes wallet address');

    // TEST 2: Sign message and Verify / Login (Happy Path)
    const challengeMessage = nonceData.data.message;
    const signature = await testWallet.signMessage(challengeMessage);
    console.log(`Generated signature: ${signature.slice(0, 20)}...`);

    const verifyRes = await fetch(`${baseUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, signature }),
    });
    const verifyData = await verifyRes.json();
    assert(verifyRes.status === 200, 'POST /verify returns 200 status');
    assert(verifyData.success === true, 'POST /verify response has success: true');
    assert(typeof verifyData.data.token === 'string', 'JWT token is returned in response');
    assert(verifyData.data.user.walletAddress === walletAddress, 'User wallet address in response matches test wallet');

    // TEST 3: Verify JWT Token validity and claims
    const decoded = jwt.verify(verifyData.data.token, config.jwtSecret);
    assert(decoded.walletAddress === walletAddress, 'Decoded JWT has correct walletAddress');
    assert(decoded.isRegistered === false, 'Un-onboarded wallet gets a limited (isRegistered: false) session');
    assert(decoded.role === undefined && decoded.clearanceLevel === undefined, 'Limited session carries no role or clearance');

    // TEST 3b: Limited session is rejected by every role-guarded route
    const limitedRes = await fetch(`${baseUrl.replace('/auth', '')}/users/me`, {
      headers: { Authorization: `Bearer ${verifyData.data.token}` },
    });
    assert(limitedRes.status === 403, 'Limited session is rejected (403) by authenticated routes');

    // TEST 4: Anti-Replay Protection (Nonce must be consumed)
    const replayRes = await fetch(`${baseUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, signature }),
    });
    assert(replayRes.status === 401, 'Replay of consumed nonce returns 401 Unauthorized');

    // TEST 5: Tampered Signature / Wrong Signer
    // Get fresh nonce for walletAddress
    const freshNonceRes = await fetch(`${baseUrl}/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });
    const freshNonceData = await freshNonceRes.json();

    // Sign with a DIFFERENT random wallet
    const attackerWallet = ethers.Wallet.createRandom();
    const bogusSignature = await attackerWallet.signMessage(freshNonceData.data.message);

    const bogusVerifyRes = await fetch(`${baseUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, signature: bogusSignature }),
    });
    assert(bogusVerifyRes.status === 401, 'Signature signed by different wallet returns 401 Unauthorized');

    // TEST 6: Malformed / Invalid Ethereum Address
    const invalidAddressRes = await fetch(`${baseUrl}/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: '0xinvalidEthAddress123' }),
    });
    assert(invalidAddressRes.status === 400, 'Invalid walletAddress returns 400 Bad Request validation error');

    // TEST 7: /login alias route works identical to /verify
    const loginNonceRes = await fetch(`${baseUrl}/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });
    const loginNonceData = await loginNonceRes.json();
    const loginSig = await testWallet.signMessage(loginNonceData.data.message);

    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, signature: loginSig }),
    });
    assert(loginRes.status === 200, 'POST /login alias returns 200 status with valid token');

  } catch (err) {
    console.error('Error during test execution:', err);
    failed++;
  } finally {
    await stopServer();
  }

  console.log(`\n--- Test Results: ${passed} Passed, ${failed} Failed ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
