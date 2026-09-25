import { ethers } from 'ethers';
import prisma from '../config/db.js';
import config from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import chainService from './chain.service.js';

/**
 * Guardian-based account recovery (issue #51).
 *
 * When someone loses the wallet their identity is anchored to, they cannot
 * sign in to ask for help — so recovery is raised on their behalf by an admin
 * or one of their guardians, and it only proceeds once enough *other* people
 * vouch for it. That threshold is the entire security property: a single
 * compromised admin account should not be able to silently move a Level 4
 * identity onto an attacker's wallet.
 *
 * The re-link preserves the DID and the identity hash. On-chain that means
 * revoking the old address and registering the same DID against the new one,
 * so the audit trail shows one continuous person changing keys rather than a
 * new employee appearing from nowhere.
 */

const DEFAULT_THRESHOLD = 2;

function approvalThreshold(guardianCount) {
  const configured = Number.parseInt(config.recoveryApprovalThreshold, 10);
  const threshold = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_THRESHOLD;
  // Never demand more approvals than there are guardians to give them,
  // otherwise a request could be permanently unapprovable.
  return Math.min(threshold, guardianCount);
}

export const recoveryService = {
  /** Admin: give an identity a guardian. */
  async addGuardian(userId, guardianId) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    if (userId === guardianId) {
      throw new ApiError(400, 'An identity cannot be its own guardian');
    }

    const [user, guardian] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.user.findUnique({ where: { id: guardianId } }),
    ]);
    if (!user) throw new ApiError(404, 'Identity not found');
    if (!guardian) throw new ApiError(404, 'Guardian identity not found');

    const existing = await prisma.guardian.findUnique({
      where: { userId_guardianId: { userId, guardianId } },
    });
    if (existing) throw new ApiError(409, 'That identity is already a guardian for this user');

    return prisma.guardian.create({
      data: { userId, guardianId },
      include: {
        guardian: { select: { id: true, displayName: true, walletAddress: true, role: true } },
      },
    });
  },

  async removeGuardian(userId, guardianId) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    const existing = await prisma.guardian.findUnique({
      where: { userId_guardianId: { userId, guardianId } },
    });
    if (!existing) throw new ApiError(404, 'That guardian is not assigned to this identity');
    await prisma.guardian.delete({ where: { id: existing.id } });
    return { removed: true };
  },

  async listGuardians(userId) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    const guardians = await prisma.guardian.findMany({
      where: { userId },
      include: {
        guardian: { select: { id: true, displayName: true, walletAddress: true, role: true, sbu: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return {
      guardians,
      threshold: approvalThreshold(guardians.length),
    };
  },

  /**
   * Raise a recovery request for someone who has lost their wallet. Callable
   * by an ADMIN or by one of that identity's own guardians.
   */
  async requestRecovery(callerUser, { userId, newWalletAddress, reason }) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    let checksumAddress;
    try {
      checksumAddress = ethers.getAddress(newWalletAddress);
    } catch {
      throw new ApiError(400, 'Invalid Ethereum wallet address');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { guardians: true },
    });
    if (!user) throw new ApiError(404, 'Identity not found');
    if (user.revokedAt) {
      throw new ApiError(409, 'This identity is revoked. Reinstate it before starting a recovery.');
    }

    if (user.walletAddress === checksumAddress) {
      throw new ApiError(400, 'That is already this identity\'s wallet address');
    }

    // The replacement wallet must be free — re-linking onto a wallet that
    // already holds an identity would collide on-chain and in the database.
    const addressTaken = await prisma.user.findUnique({ where: { walletAddress: checksumAddress } });
    if (addressTaken) {
      throw new ApiError(409, 'That wallet address already belongs to another identity');
    }

    const isGuardian = user.guardians.some((g) => g.guardianId === callerUser.id);
    if (callerUser.role !== 'ADMIN' && !isGuardian) {
      throw new ApiError(403, 'Only an admin or one of this identity\'s guardians may request recovery');
    }

    if (user.guardians.length === 0) {
      throw new ApiError(
        400,
        'This identity has no guardians assigned, so recovery cannot be vouched for. An admin must assign guardians first.'
      );
    }

    const open = await prisma.recoveryRequest.findFirst({
      where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (open) throw new ApiError(409, 'A recovery request is already open for this identity');

    const request = await prisma.recoveryRequest.create({
      data: {
        userId,
        newWalletAddress: checksumAddress,
        reason,
        requestedById: callerUser.id,
        oldWalletAddress: user.walletAddress,
      },
    });

    logger.info(`Recovery requested for ${user.externalId ?? userId} -> ${checksumAddress}`);
    return this.getRequest(request.id);
  },

  /**
   * A guardian vouches for a request. The requester's own vote does not count
   * — recovery needs corroboration from someone who did not initiate it.
   */
  async approveRecovery(callerUser, requestId) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const request = await prisma.recoveryRequest.findUnique({
      where: { id: requestId },
      include: { user: { include: { guardians: true } }, approvals: true },
    });
    if (!request) throw new ApiError(404, 'Recovery request not found');
    if (request.status !== 'PENDING') {
      throw new ApiError(400, `This request is already ${request.status.toLowerCase()}`);
    }

    const isGuardian = request.user.guardians.some((g) => g.guardianId === callerUser.id);
    if (!isGuardian) throw new ApiError(403, 'Only an assigned guardian may approve this recovery');

    if (request.requestedById === callerUser.id) {
      throw new ApiError(
        403,
        'You raised this request, so another guardian must vouch for it'
      );
    }

    await prisma.recoveryApproval.create({
      data: { recoveryRequestId: requestId, guardianId: callerUser.id },
    });

    const approvals = request.approvals.length + 1;
    const threshold = approvalThreshold(request.user.guardians.length);

    if (approvals >= threshold) {
      await prisma.recoveryRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED' },
      });
      logger.info(`Recovery ${requestId} reached its approval threshold (${approvals}/${threshold})`);
    }

    return this.getRequest(requestId);
  },

  async rejectRecovery(callerUser, requestId, rejectionReason) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const request = await prisma.recoveryRequest.findUnique({
      where: { id: requestId },
      include: { user: { include: { guardians: true } } },
    });
    if (!request) throw new ApiError(404, 'Recovery request not found');
    if (request.status === 'COMPLETED') {
      throw new ApiError(400, 'This recovery has already been executed');
    }

    const isGuardian = request.user.guardians.some((g) => g.guardianId === callerUser.id);
    if (callerUser.role !== 'ADMIN' && !isGuardian) {
      throw new ApiError(403, 'Only an admin or an assigned guardian may reject this recovery');
    }

    await prisma.recoveryRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED', rejectionReason },
    });
    return this.getRequest(requestId);
  },

  /**
   * Admin: execute an approved recovery. Revokes the old address on-chain,
   * re-registers the same DID and identity hash against the new one, moves the
   * role across, and only then updates the Postgres cache.
   */
  async executeRecovery(requestId) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const request = await prisma.recoveryRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request) throw new ApiError(404, 'Recovery request not found');
    if (request.status !== 'APPROVED') {
      throw new ApiError(
        400,
        `Recovery must be approved by its guardians first (currently ${request.status.toLowerCase()})`
      );
    }

    const { user, newWalletAddress } = request;

    // Re-check: guardians may have taken time to approve, and the replacement
    // wallet could have been registered by someone else in the meantime.
    const addressTaken = await prisma.user.findUnique({ where: { walletAddress: newWalletAddress } });
    if (addressTaken) {
      throw new ApiError(409, 'That wallet address now belongs to another identity');
    }

    const revoke = await chainService.revokeIdentityOnChain({
      walletAddress: user.walletAddress,
      reason: `Guardian recovery ${requestId}`,
    });
    if (revoke.error) {
      throw new ApiError(502, `Could not revoke the old identity on-chain: ${revoke.error}`);
    }

    // Same DID, same identity hash: this is the same person on a new key.
    const relink = await chainService.registerIdentityOnChain({
      walletAddress: newWalletAddress,
      did: user.did,
      identityHash: user.identityHash,
      clearanceLevel: user.clearanceLevel,
      sbu: user.sbu,
    });
    if (relink.error) {
      // The old address is already revoked, so leave the request APPROVED and
      // let an admin retry rather than marking it complete.
      logger.error(`Recovery ${requestId}: re-link failed after revoke — ${relink.error}`);
      throw new ApiError(
        502,
        `The old wallet was revoked but the new one could not be registered: ${relink.error}. Retry this recovery once the chain issue is resolved.`
      );
    }

    // Best-effort, exactly as at registration: a failed grant is reported, not
    // fatal, and is completed from the role-assignment screen.
    const grant = await chainService.grantRoleOnChain({
      walletAddress: newWalletAddress,
      role: user.role,
    });

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { walletAddress: newWalletAddress },
      }),
      prisma.recoveryRequest.update({
        where: { id: requestId },
        data: {
          status: 'COMPLETED',
          revokeTxHash: revoke.txHash ?? null,
          relinkTxHash: relink.txHash ?? null,
          completedAt: new Date(),
        },
      }),
    ]);

    logger.info(
      `Recovery ${requestId} complete: ${user.walletAddress} -> ${newWalletAddress} (DID ${user.did} preserved)`
    );

    return {
      user: {
        id: updatedUser.id,
        did: updatedUser.did,
        displayName: updatedUser.displayName,
        walletAddress: updatedUser.walletAddress,
        role: updatedUser.role,
      },
      chain: {
        revokeTxHash: revoke.txHash ?? null,
        relinkTxHash: relink.txHash ?? null,
        roleGranted: !grant.error && Boolean(grant.confirmed),
        ...(grant.error
          ? { roleError: grant.error, warning: 'Identity re-linked but the role grant failed; re-apply the role from role assignment.' }
          : {}),
      },
    };
  },

  /**
   * One recovery request.
   *
   * `callerUser` is optional because the mutating methods above call this to
   * build their own response, having already authorized the caller. When it IS
   * passed (i.e. from the read route) access is enforced: a recovery request
   * carries the subject's DID, employee code and both wallet addresses, so it
   * is not something any authenticated user should be able to pull by id.
   */
  async getRequest(requestId, callerUser = null) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    const request = await prisma.recoveryRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: { id: true, did: true, displayName: true, externalId: true, walletAddress: true, sbu: true, role: true, guardians: true },
        },
        requestedBy: { select: { id: true, displayName: true, role: true } },
        approvals: { include: { guardian: { select: { id: true, displayName: true } } } },
      },
    });
    if (!request) throw new ApiError(404, 'Recovery request not found');

    if (callerUser) {
      const isOversight = ['ADMIN', 'AUDITOR'].includes(callerUser.role);
      const isSubject = request.userId === callerUser.id;
      const isRequester = request.requestedById === callerUser.id;
      const isGuardian = request.user.guardians.some((g) => g.guardianId === callerUser.id);
      if (!isOversight && !isSubject && !isRequester && !isGuardian) {
        throw new ApiError(403, 'You are not a party to this recovery request');
      }
    }

    const threshold = approvalThreshold(request.user.guardians.length);
    const { guardians, ...userWithoutGuardians } = request.user;

    return {
      ...request,
      user: userWithoutGuardians,
      approvalCount: request.approvals.length,
      threshold,
      guardianCount: guardians.length,
    };
  },

  async listRequests({ status } = {}) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    const requests = await prisma.recoveryRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, did: true, displayName: true, externalId: true, walletAddress: true } },
        requestedBy: { select: { id: true, displayName: true } },
        approvals: { select: { guardianId: true } },
      },
    });
    return requests.map((r) => ({ ...r, approvalCount: r.approvals.length }));
  },
};

export default recoveryService;
