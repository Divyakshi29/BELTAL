import { ethers } from 'ethers';
import prisma from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import scopeService from './scope.service.js';

export const passService = {
  /**
   * Manager / Admin: Grant a time-boxed Cross-SBU access pass (Issue #46).
   * A pass opens `targetSbu` to its holder, so only that SBU's own Manager (or
   * an Admin) may issue it; a Manager can't open another SBU's assets to anyone.
   */
  async grantCrossSbuPass(issuerUser, input) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    if (!scopeService.canManageSbu(issuerUser, input.targetSbu)) {
      throw new ApiError(403, 'Managers can only issue passes into their own SBU');
    }

    let targetUser = null;
    if (input.userId) {
      targetUser = await prisma.user.findUnique({ where: { id: input.userId } });
    } else if (input.walletAddress) {
      let checksumAddress;
      try {
        checksumAddress = ethers.getAddress(input.walletAddress);
      } catch {
        throw new ApiError(400, 'Invalid Ethereum wallet address');
      }
      targetUser = await prisma.user.findUnique({ where: { walletAddress: checksumAddress } });
    }

    if (!targetUser) {
      throw new ApiError(404, 'Target personnel identity not found');
    }

    let validUntil;
    if (input.validUntil) {
      validUntil = new Date(input.validUntil);
    } else {
      const hours = input.durationHours || 24;
      validUntil = new Date(Date.now() + hours * 3600 * 1000);
    }

    if (validUntil.getTime() <= Date.now()) {
      throw new ApiError(400, 'validUntil must be in the future');
    }

    const pass = await prisma.crossSbuPass.create({
      data: {
        userId: targetUser.id,
        targetSbu: input.targetSbu,
        validUntil,
        reason: input.reason || 'Cross-department technical assignment',
        issuedById: (issuerUser?.isRegistered === false ? null : issuerUser?.id) || targetUser.id,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            externalId: true,
            walletAddress: true,
            sbu: true,
          },
        },
        issuedBy: {
          select: {
            id: true,
            displayName: true,
            role: true,
          },
        },
      },
    });

    return pass;
  },

  /**
   * Check if user possesses an active, unexpired Cross-SBU pass for a given SBU
   */
  async hasActiveCrossSbuPass(userId, targetSbu) {
    if (!prisma) return false;

    const activePass = await prisma.crossSbuPass.findFirst({
      where: {
        userId,
        targetSbu,
        validUntil: { gt: new Date() },
      },
    });

    return Boolean(activePass);
  },

  /**
   * Retrieve active passes for a user
   */
  async getActivePassesForUser(userId, callerUser) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const passes = await prisma.crossSbuPass.findMany({
      where: {
        userId,
        validUntil: { gt: new Date() },
      },
      include: {
        issuedBy: {
          select: { id: true, displayName: true, role: true },
        },
      },
      orderBy: { validUntil: 'desc' },
    });

    if (callerUser?.role !== 'MANAGER' || userId === callerUser.id) return passes;

    // A Manager sees every pass of personnel in their SBU scope, and, for anyone
    // else, only the passes that open their own scope.
    const scope = await scopeService.getSbuScope(callerUser);
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { sbu: true } });
    if (target && scope.sbus.includes(target.sbu)) return passes;
    return passes.filter((p) => scope.sbus.includes(p.targetSbu));
  },
};

export default passService;
