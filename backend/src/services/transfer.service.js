import { ethers } from 'ethers';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import passService from './pass.service.js';
import chainService from './chain.service.js';
import auditService from './audit.service.js';
import scopeService from './scope.service.js';

// Sessions without a DB identity (e.g. the ADMIN_WALLETS dev override) carry a
// wallet address as their id, which can't be stored as an actor/approver FK.
const actorIdOf = (user) => (user?.isRegistered === false ? null : user?.id);

export const transferService = {
  /**
   * Request transfer of an asset currently in custody (Issue #46)
   */
  async requestTransfer(callerUser, input) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    if (!actorIdOf(callerUser)) {
      throw new ApiError(403, 'A registered identity is required to request a transfer');
    }

    // 1. Fetch Asset and Validate Current Custody
    const asset = await prisma.asset.findUnique({
      where: { id: input.assetId },
      include: { owner: true },
    });

    if (!asset) {
      throw new ApiError(404, 'Asset not found');
    }

    // Custody check: only the current custodian, an Admin, or the Manager of the
    // asset's SBU can initiate a handover
    if (asset.ownerId !== callerUser.id && !scopeService.canManageSbu(callerUser, asset.sbu)) {
      throw new ApiError(
        403,
        callerUser.role === 'MANAGER'
          ? 'Managers can only request transfers for assets in their own SBU or in their custody'
          : 'You can only request transfers for assets currently in your custody'
      );
    }

    // 2. Resolve Target Recipient
    let toUser = null;
    if (input.toUserId) {
      toUser = await prisma.user.findUnique({ where: { id: input.toUserId } });
    } else if (input.toWalletAddress) {
      let checksumAddress;
      try {
        checksumAddress = ethers.getAddress(input.toWalletAddress);
      } catch {
        throw new ApiError(400, 'Invalid Ethereum wallet address');
      }
      toUser = await prisma.user.findUnique({ where: { walletAddress: checksumAddress } });
    }

    if (!toUser) {
      throw new ApiError(404, 'Target recipient personnel not found');
    }

    if (toUser.id === asset.ownerId) {
      throw new ApiError(400, 'Target recipient is already the current custodian of this asset');
    }

    // 3. Clearance Gate: toUser.clearanceLevel >= asset.classificationTier
    if (toUser.clearanceLevel < asset.classificationTier) {
      throw new ApiError(
        400,
        `Target recipient clearance level (Level ${toUser.clearanceLevel}) is insufficient for this asset (requires Level ${asset.classificationTier})`
      );
    }

    // 4. SBU Alignment / Cross-SBU Pass Check
    if (toUser.sbu !== asset.sbu) {
      const hasPass = await passService.hasActiveCrossSbuPass(toUser.id, asset.sbu);
      if (!hasPass) {
        throw new ApiError(
          400,
          `Target recipient belongs to SBU ${toUser.sbu} while asset belongs to ${asset.sbu}. An active Cross-SBU Pass is required for cross-department custody handover.`
        );
      }
    }

    // 5. Prevent Duplicate Pending Transfer Requests
    const existingPending = await prisma.transferRequest.findFirst({
      where: {
        assetId: asset.id,
        status: 'PENDING',
      },
    });

    if (existingPending) {
      throw new ApiError(409, 'A transfer request is already pending approval for this asset');
    }

    // 6. Create TransferRequest
    const transferRequest = await prisma.transferRequest.create({
      data: {
        assetId: asset.id,
        fromUserId: asset.ownerId,
        toUserId: toUser.id,
        requestedById: callerUser.id,
        status: 'PENDING',
      },
      include: {
        asset: true,
        fromUser: { select: { id: true, displayName: true, walletAddress: true, sbu: true } },
        toUser: { select: { id: true, displayName: true, walletAddress: true, sbu: true } },
        requestedBy: { select: { id: true, displayName: true, role: true } },
      },
    });

    // 7. Audit Event: TRANSFER_REQUESTED
    await auditService
      .recordEvent({
        type: 'TRANSFER_REQUESTED',
        actorId: callerUser.id,
        targetId: asset.id,
        txHash: `0xreq_${Date.now().toString(16)}`,
        blockNumber: 0,
        payload: {
          transferRequestId: transferRequest.id,
          assetId: asset.id,
          assetName: asset.name,
          fromUserId: asset.ownerId,
          toUserId: toUser.id,
          reason: input.reason || null,
        },
      })
      .catch((err) => logger.warn(`Failed to log TRANSFER_REQUESTED audit event: ${err.message}`));

    return transferRequest;
  },

  /**
   * List transfer requests (incoming, outgoing, pending, or historical)
   */
  async listTransfers(callerUser, query) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.assetId) {
      where.assetId = query.assetId;
    }

    // Admin and Auditor see every request; a Manager sees their SBU scope; anyone
    // else only the requests they are a party to.
    const isPrivileged = ['ADMIN', 'MANAGER', 'AUDITOR'].includes(callerUser.role);

    if (callerUser.role === 'MANAGER') {
      const scope = await scopeService.getSbuScope(callerUser);
      where.AND = [scopeService.transferWhere(scope)];
    }

    if (!isPrivileged) {
      if (query.type === 'incoming') {
        where.toUserId = callerUser.id;
      } else if (query.type === 'outgoing') {
        where.fromUserId = callerUser.id;
      } else {
        where.OR = [
          { fromUserId: callerUser.id },
          { toUserId: callerUser.id },
          { requestedById: callerUser.id },
        ];
      }
    }

    if (query.type === 'pending') {
      where.status = 'PENDING';
    }

    const [total, transferRequests] = await Promise.all([
      prisma.transferRequest.count({ where }),
      prisma.transferRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          asset: true,
          fromUser: { select: { id: true, displayName: true, walletAddress: true, sbu: true } },
          toUser: { select: { id: true, displayName: true, walletAddress: true, sbu: true } },
          requestedBy: { select: { id: true, displayName: true, role: true } },
          approvedBy: { select: { id: true, displayName: true, role: true } },
        },
      }),
    ]);

    return {
      transferRequests,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Manager / Admin: Approve and execute on-chain custody handover (Issue #46)
   */
  async approveTransfer(callerUser, transferRequestId) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const transferRequest = await prisma.transferRequest.findUnique({
      where: { id: transferRequestId },
      include: {
        asset: true,
        toUser: true,
        fromUser: true,
      },
    });

    if (!transferRequest) {
      throw new ApiError(404, 'Transfer request not found');
    }

    // Dual authorization: a different person must approve than the one who
    // raised the request, whatever their role.
    if (transferRequest.requestedById === callerUser.id) {
      throw new ApiError(403, 'You cannot approve a transfer request you raised; another approver must review it');
    }
    if (!scopeService.canManageSbu(callerUser, transferRequest.asset.sbu)) {
      throw new ApiError(403, 'Managers can only approve transfers for assets in their own SBU');
    }

    if (transferRequest.status !== 'PENDING') {
      throw new ApiError(400, `Transfer request has already been processed with status: ${transferRequest.status}`);
    }

    // Re-verify clearance gate
    if (transferRequest.toUser.clearanceLevel < transferRequest.asset.classificationTier) {
      throw new ApiError(
        400,
        `Recipient clearance level (Level ${transferRequest.toUser.clearanceLevel}) is insufficient for this asset (requires Level ${transferRequest.asset.classificationTier})`
      );
    }

    // Re-verify SBU / Cross-SBU pass
    if (transferRequest.toUser.sbu !== transferRequest.asset.sbu) {
      const hasPass = await passService.hasActiveCrossSbuPass(
        transferRequest.toUserId,
        transferRequest.asset.sbu
      );
      if (!hasPass) {
        throw new ApiError(
          400,
          `Recipient requires an active Cross-SBU Pass for ${transferRequest.asset.sbu}`
        );
      }
    }

    // The request may have gone stale if custody moved (e.g. an on-chain
    // reassignment synced into the cache) since it was raised.
    if (transferRequest.asset.ownerId !== transferRequest.fromUserId) {
      throw new ApiError(409, 'Asset custody has changed since this request was raised; reject it and request again');
    }

    // Claim the request atomically before touching the chain so two concurrent
    // approvals can't both submit a custody transfer.
    const approverId = actorIdOf(callerUser);
    const claimed = await prisma.transferRequest.updateMany({
      where: { id: transferRequestId, status: 'PENDING' },
      data: { status: 'APPROVED', approvedById: approverId },
    });
    if (claimed.count === 0) {
      throw new ApiError(409, 'Transfer request is already being processed');
    }

    // 1. Execute On-Chain Custody Reassignment (Issue #100 — EIP-712 signature)
    //
    // If the TransferRequest carries a pre-built EIP-712 custodian signature
    // (stored when the outgoing custodian accepted the handover on the frontend),
    // pass it through to chain.service so the verified transferCustody() path is used.
    //
    // If no signature is present (emergency / admin-initiated bypasses), the chain
    // service falls back to reassignCustody() — the admin-only path that stores an
    // empty signature in custodyHistory as a bypass marker.
    //
    // deadline: 1 hour from approval time — long enough for the tx to confirm.
    const signatureDeadline = Math.floor(Date.now() / 1000) + 3600;

    let chainResult;
    try {
      chainResult = await chainService.reassignCustodyOnChain({
        tokenId: transferRequest.asset.tokenId,
        newCustodianWallet: transferRequest.toUser.walletAddress,
        reason: 'DUAL_AUTHORIZED_MANAGER_APPROVAL',
        signature: transferRequest.custodianSignature ?? null,  // hex EIP-712 sig from frontend
        deadline: signatureDeadline,
      });
    } catch (err) {
      chainResult = { confirmed: false, error: err.message };
    }

    // A reported chain failure (revert, RPC error) must not be recorded as an
    // executed transfer; release the claim so it can be retried or rejected.
    if (chainResult.error) {
      await prisma.transferRequest.updateMany({
        where: { id: transferRequestId, status: 'APPROVED' },
        data: { status: 'PENDING', approvedById: null },
      });
      throw new ApiError(502, `On-chain custody transfer failed: ${chainResult.error}`);
    }


    if (!chainResult.confirmed) {
      logger.warn(
        `Custody transfer for asset ${transferRequest.asset.name} updated off-chain pending smart contract integration.`
      );
    }

    // 2 + 3. Update the cached custodian and mark the request EXECUTED together
    const [, updatedRequest] = await prisma.$transaction([
      prisma.asset.update({
        where: { id: transferRequest.assetId },
        data: { ownerId: transferRequest.toUserId },
      }),
      prisma.transferRequest.update({
        where: { id: transferRequestId },
        data: {
          status: 'EXECUTED',
          approvedById: approverId,
          txHash: chainResult.txHash,
        },
        include: {
          asset: true,
          fromUser: { select: { id: true, displayName: true, walletAddress: true } },
          toUser: { select: { id: true, displayName: true, walletAddress: true } },
          approvedBy: { select: { id: true, displayName: true, role: true } },
        },
      }),
    ]);

    // 4. Log Immutable Audit Log: OWNERSHIP_TRANSFERRED
    await auditService
      .recordEvent({
        type: 'OWNERSHIP_TRANSFERRED',
        actorId: approverId,
        targetId: transferRequest.assetId,
        txHash: chainResult.txHash || `0xxfer_${Date.now().toString(16)}`,
        blockNumber: chainResult.blockNumber,
        payload: {
          transferRequestId: transferRequest.id,
          assetId: transferRequest.assetId,
          assetName: transferRequest.asset.name,
          fromUserId: transferRequest.fromUserId,
          toUserId: transferRequest.toUserId,
          approvedById: approverId,
          txHash: chainResult.txHash,
        },
      })
      .catch((err) => logger.warn(`Failed to log OWNERSHIP_TRANSFERRED audit event: ${err.message}`));

    return { transferRequest: updatedRequest, chain: chainResult };
  },

  /**
   * Reject a pending transfer request
   */
  async rejectTransfer(callerUser, transferRequestId, reason) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const transferRequest = await prisma.transferRequest.findUnique({
      where: { id: transferRequestId },
      include: { asset: { select: { sbu: true } } },
    });

    if (!transferRequest) {
      throw new ApiError(404, 'Transfer request not found');
    }

    // Same separation of duties as approval: the requester never decides.
    if (transferRequest.requestedById === callerUser.id) {
      throw new ApiError(403, 'You cannot reject a transfer request you raised; another approver must review it');
    }

    // Only an Admin, the Manager of the asset's SBU, or the current custodian
    // (fromUser) can reject
    const canReject =
      scopeService.canManageSbu(callerUser, transferRequest.asset.sbu) ||
      transferRequest.fromUserId === callerUser.id;

    if (!canReject) {
      throw new ApiError(403, 'Not authorized to reject this transfer request');
    }

    if (transferRequest.status !== 'PENDING') {
      throw new ApiError(400, `Transfer request has already been processed with status: ${transferRequest.status}`);
    }

    // Only a still-PENDING request can be rejected; this guards against racing
    // an approval that started after the status check above.
    const rejectedById = actorIdOf(callerUser);
    const claimed = await prisma.transferRequest.updateMany({
      where: { id: transferRequestId, status: 'PENDING' },
      data: { status: 'REJECTED', approvedById: rejectedById },
    });
    if (claimed.count === 0) {
      throw new ApiError(409, 'Transfer request is already being processed');
    }

    const updated = await prisma.transferRequest.findUnique({
      where: { id: transferRequestId },
      include: {
        asset: true,
        fromUser: { select: { id: true, displayName: true } },
        toUser: { select: { id: true, displayName: true } },
      },
    });

    await auditService
      .recordEvent({
        type: 'TRANSFER_REJECTED',
        actorId: rejectedById,
        targetId: transferRequest.assetId,
        txHash: `0xrej_${Date.now().toString(16)}`,
        blockNumber: 0,
        payload: {
          transferRequestId: transferRequest.id,
          assetId: transferRequest.assetId,
          fromUserId: transferRequest.fromUserId,
          toUserId: transferRequest.toUserId,
          reason: reason || null,
        },
      })
      .catch((err) => logger.warn(`Failed to log TRANSFER_REJECTED audit event: ${err.message}`));

    return updated;
  },
};

export default transferService;
