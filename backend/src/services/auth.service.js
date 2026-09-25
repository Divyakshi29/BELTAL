import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import config from '../config/env.js';
import logger from '../config/logger.js';
import prisma from '../config/db.js';
import nonceService from './nonce.service.js';
import ApiError from '../utils/ApiError.js';

/**
 * Session for a registered identity. The role/clearance/SBU claims always come
 * from the DB row — nothing the client sends can influence them.
 */
function buildSession(userRecord) {
  const user = {
    id: userRecord.id,
    walletAddress: userRecord.walletAddress,
    displayName: userRecord.displayName,
    externalId: userRecord.externalId,
    did: userRecord.did,
    role: userRecord.role,
    clearanceLevel: userRecord.clearanceLevel,
    sbu: userRecord.sbu,
    isRegistered: true,
  };

  const token = jwt.sign(
    {
      sub: user.id,
      walletAddress: user.walletAddress,
      displayName: user.displayName,
      did: user.did,
      role: user.role,
      clearanceLevel: user.clearanceLevel,
      sbu: user.sbu,
      isRegistered: true,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return { token, user };
}

/**
 * Limited session for a wallet with no identity yet: no role or clearance, and
 * `authenticate` rejects it everywhere except the registration endpoints. It
 * deliberately has no `sub`, so nothing can mistake it for a User id.
 */
function buildLimitedSession(walletAddress) {
  const user = { walletAddress, isRegistered: false };
  const token = jwt.sign({ walletAddress, isRegistered: false }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  return { token, user };
}

export const authService = {
  buildSession,
  /**
   * Request a single-use cryptographic sign-in challenge nonce
   * @param {string} walletAddress
   * @returns {{ walletAddress: string, nonce: string, message: string, expiresAt: string }}
   */
  requestNonce(walletAddress) {
    let checksumAddress;
    try {
      checksumAddress = ethers.getAddress(walletAddress);
    } catch {
      throw new ApiError(400, 'Invalid Ethereum wallet address');
    }

    const { nonce, message, expiresAt } = nonceService.generateNonce(checksumAddress);

    return {
      walletAddress: checksumAddress,
      nonce,
      message,
      expiresAt,
    };
  },

  /**
   * Verify an ECDSA signature against the active nonce challenge and issue a JWT
   * @param {{ walletAddress: string, signature: string }} param0
   * @returns {Promise<{ token: string, user: object }>}
   */
  async verifyWalletLogin({ walletAddress, signature }) {
    let checksumAddress;
    try {
      checksumAddress = ethers.getAddress(walletAddress);
    } catch {
      throw new ApiError(400, 'Invalid Ethereum wallet address format');
    }

    // Retrieve active challenge message
    const storedChallenge = nonceService.getStoredNonce(checksumAddress);
    if (!storedChallenge) {
      throw new ApiError(
        401,
        'No active authentication challenge found for this address or the challenge has expired. Please request a new nonce.'
      );
    }

    // Recover signer address from ECDSA signature using ethers
    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(storedChallenge.message, signature);
    } catch (err) {
      throw new ApiError(401, `Cryptographic signature verification failed: ${err.message}`);
    }

    // Strict address match verification
    if (ethers.getAddress(recoveredAddress) !== checksumAddress) {
      throw new ApiError(401, 'Signature does not match the provided wallet address.');
    }

    // Immediately consume nonce to prevent replay attacks
    nonceService.consumeNonce(checksumAddress);

    if (!prisma) throw new ApiError(503, 'Database unavailable');
    const userRecord = await prisma.user.findUnique({ where: { walletAddress: checksumAddress } });

    if (userRecord?.revokedAt) {
      throw new ApiError(403, 'This identity has been revoked. Contact your security administrator.');
    }

    // SYSTEM_CONNECTOR identities are machine-only (PACS/HRMS ingest via a
    // backend-held custodial signer, see issue #74) — never reachable via the
    // human wallet-sign-in flow, even if someone controls that wallet's key.
    if (userRecord && userRecord.role === 'SYSTEM_CONNECTOR') {
      throw new ApiError(403, 'System-connector identities cannot authenticate via wallet sign-in');
    }

    // An unknown wallet proves key ownership but has no identity: it gets a
    // limited session that can only submit/check a registration request.
    const session = userRecord ? buildSession(userRecord) : buildLimitedSession(checksumAddress);

    logger.info(
      `Wallet authenticated successfully: ${checksumAddress} (${userRecord ? `Role: ${userRecord.role}` : 'unregistered'})`
    );

    return session;
  },

  /**
   * Machine-only counterpart to verifyWalletLogin, for the ROLE_SYSTEM_CONNECTOR
   * custodial identity (issue #74). Uses the same nonce + ECDSA
   * proof-of-key-possession flow (request a nonce via POST /auth/nonce same
   * as any wallet), but is a distinct code path from the human sign-in above
   * — that path explicitly rejects SYSTEM_CONNECTOR identities so machine
   * credentials never share a route/rate-limit/audit trail with human
   * sign-in. Only succeeds for a wallet already provisioned with the
   * SYSTEM_CONNECTOR role (see POST /api/admin/identities).
   */
  async verifySystemConnectorLogin({ walletAddress, signature }) {
    let checksumAddress;
    try {
      checksumAddress = ethers.getAddress(walletAddress);
    } catch {
      throw new ApiError(400, 'Invalid Ethereum wallet address format');
    }

    const storedChallenge = nonceService.getStoredNonce(checksumAddress);
    if (!storedChallenge) {
      throw new ApiError(
        401,
        'No active authentication challenge found for this address or the challenge has expired. Please request a new nonce.'
      );
    }

    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(storedChallenge.message, signature);
    } catch (err) {
      throw new ApiError(401, `Cryptographic signature verification failed: ${err.message}`);
    }

    if (ethers.getAddress(recoveredAddress) !== checksumAddress) {
      throw new ApiError(401, 'Signature does not match the provided wallet address.');
    }

    nonceService.consumeNonce(checksumAddress);

    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const userRecord = await prisma.user.findUnique({ where: { walletAddress: checksumAddress } });
    if (!userRecord || userRecord.role !== 'SYSTEM_CONNECTOR') {
      throw new ApiError(403, 'This login path is reserved for provisioned SYSTEM_CONNECTOR identities');
    }
    if (userRecord.revokedAt) {
      throw new ApiError(403, 'This machine identity has been revoked');
    }

    const session = buildSession(userRecord);

    logger.info(`System-connector machine identity authenticated: ${checksumAddress}`);

    return session;
  },
};

export default authService;
