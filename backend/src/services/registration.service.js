import { ethers } from 'ethers';
import prisma from '../config/db.js';
import config from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import authService from './auth.service.js';
import identityService from './identity.service.js';
import chainService from './chain.service.js';

// Highest clearance level accepted by registerIdentity (see admin.validator).
const MAX_CLEARANCE = 4;

/**
 * Self-service onboarding. A wallet with no identity submits a request; an
 * ADMIN approves it. Approval goes through identityService.registerIdentity,
 * which stays the only place a User (and its chain/IPFS records) is created.
 */
export const registrationService = {
  /**
   * Status of the caller's wallet, for the limited session to poll. Once the
   * identity exists this also hands back a full session, so an approved user
   * is upgraded without signing in again.
   */
  async getStatus(walletAddress) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const userRecord = await prisma.user.findUnique({ where: { walletAddress } });
    if (userRecord) {
      if (userRecord.role === 'SYSTEM_CONNECTOR') {
        throw new ApiError(403, 'System-connector identities cannot authenticate via wallet sign-in');
      }
      return { status: 'APPROVED', ...authService.buildSession(userRecord) };
    }

    const request = await prisma.registrationRequest.findUnique({ where: { walletAddress } });
    return {
      status: request ? request.status : 'NONE',
      request,
      bootstrapAdmin: config.adminWallets.includes(walletAddress),
    };
  },

  /**
   * Submit (or re-submit after a rejection) a registration request. A wallet on
   * the ADMIN_WALLETS allow-list is approved on the spot as ADMIN with maximum
   * clearance; the role is never taken from the caller.
   */
  async submit(walletAddress, { fullName, externalId, requestedSbu, note }) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const bootstrap = config.adminWallets.includes(walletAddress);

    const registered = await prisma.user.findFirst({
      where: { OR: [{ walletAddress }, { externalId }] },
    });
    if (registered) {
      throw new ApiError(409, 'An identity already exists for this wallet address or employee ID');
    }

    const existing = await prisma.registrationRequest.findUnique({ where: { walletAddress } });
    // A bootstrap admin may retry a PENDING request left over from a failed approval.
    if (existing?.status === 'PENDING' && !bootstrap) {
      throw new ApiError(409, 'A registration request for this wallet is already pending approval');
    }

    const clash = await prisma.registrationRequest.findFirst({
      where: { externalId, status: 'PENDING', walletAddress: { not: walletAddress } },
    });
    if (clash) {
      throw new ApiError(409, 'A registration request for this employee ID is already pending');
    }

    const data = {
      fullName,
      externalId,
      requestedSbu,
      note: note ?? null,
      status: 'PENDING',
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
    };
    let request;
    try {
      request = await prisma.registrationRequest.upsert({
        where: { walletAddress },
        create: { walletAddress, ...data },
        update: data,
      });
    } catch (err) {
      if (err.code === 'P2002') {
        throw new ApiError(409, 'A registration request for this wallet is already pending approval');
      }
      throw err;
    }

    if (!bootstrap) return { status: 'PENDING', request };

    logger.info(`Bootstrap admin ${walletAddress} registering via ADMIN_WALLETS allow-list`);
    const { user } = await registrationService.approve(request.id, null, { role: 'ADMIN', clearanceLevel: MAX_CLEARANCE });
    return { status: 'APPROVED', ...authService.buildSession(user) };
  },

  async list({ status = 'PENDING' } = {}) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    const where = { status };
    const [registrations, total] = await Promise.all([
      prisma.registrationRequest.findMany({ where, orderBy: { createdAt: 'asc' }, take: 100 }),
      prisma.registrationRequest.count({ where }),
    ]);
    return { registrations, total };
  },

  /**
   * Admin: approve a PENDING request with the role/clearance/SBU they choose.
   * `reviewerId` is null for the automatic bootstrap-admin approval.
   */
  async approve(id, reviewerId, { role, clearanceLevel, sbu }) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const request = await prisma.registrationRequest.findUnique({ where: { id } });
    if (!request) throw new ApiError(404, 'Registration request not found');
    if (request.status !== 'PENDING') {
      throw new ApiError(409, `Registration request was already ${request.status.toLowerCase()}`);
    }

    let checksumAddress;
    try {
      checksumAddress = ethers.getAddress(request.walletAddress);
    } catch {
      checksumAddress = request.walletAddress;
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ walletAddress: checksumAddress }, { externalId: request.externalId }] },
    });

    let result;
    if (existingUser) {
      const grant = await chainService.grantRoleOnChain({ walletAddress: checksumAddress, role: role || existingUser.role });
      result = {
        user: existingUser,
        chain: { confirmed: true, alreadyRegistered: true, roleGranted: grant.confirmed, roleTxHash: grant.txHash },
      };
    } else {
      result = await identityService.registerIdentity({
        walletAddress: request.walletAddress,
        externalId: request.externalId,
        fullName: request.fullName,
        role,
        clearanceLevel,
        sbu: sbu ?? request.requestedSbu,
      });
    }

    await prisma.registrationRequest.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date(), rejectionReason: null },
    });

    return result;
  },

  async reject(id, reviewerId, { reason }) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const request = await prisma.registrationRequest.findUnique({ where: { id } });
    if (!request) throw new ApiError(404, 'Registration request not found');
    if (request.status !== 'PENDING') {
      throw new ApiError(409, `Registration request was already ${request.status.toLowerCase()}`);
    }

    return prisma.registrationRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), rejectionReason: reason },
    });
  },
};

export default registrationService;
