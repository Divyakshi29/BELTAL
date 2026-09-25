import { ethers } from 'ethers';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import ipfsService from './ipfs.service.js';
import chainService from './chain.service.js';
import auditService from './audit.service.js';
import scopeService from './scope.service.js';
import { encryptDossier } from '../utils/dossier.util.js';

export const assetService = {
  /**
   * Admin / Manager: Mint a new defence asset NFT and assign custody (Issue #45).
   * 1. Resolves target custodian (owner).
   * 2. Enforces custody clearance gate (user.clearanceLevel >= asset.classificationTier).
   * 3. Uploads structured metadata to IPFS via Pinata.
   * 4. Calls smart contract mint function (or logs graceful fallback).
   * 5. Persists Asset and AuditEvent in PostgreSQL.
   */
  async mintAsset(callerUser, input) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    if (callerUser?.role === 'MANAGER' && !scopeService.canManageSbu(callerUser, input.sbu)) {
      throw new ApiError(403, 'Managers can only mint assets for their own SBU');
    }

    // 1. Resolve Target Custodian
    let custodian = null;
    if (input.ownerId) {
      custodian = await prisma.user.findUnique({ where: { id: input.ownerId } });
    } else if (input.ownerWalletAddress) {
      let checksumAddress;
      try {
        checksumAddress = ethers.getAddress(input.ownerWalletAddress);
      } catch {
        throw new ApiError(400, 'Invalid Ethereum wallet address');
      }
      custodian = await prisma.user.findUnique({ where: { walletAddress: checksumAddress } });
    } else if (callerUser && callerUser.id) {
      custodian = await prisma.user.findUnique({ where: { id: callerUser.id } });
    }

    if (!custodian) {
      throw new ApiError(404, 'Target custodian identity not found');
    }

    // 2. Custody & Clearance Gates (user.clearanceLevel >= asset.classificationTier)
    if (custodian.clearanceLevel < input.classificationTier) {
      throw new ApiError(
        400,
        `Custodian clearance level (Level ${custodian.clearanceLevel}) is insufficient for this asset classification (requires Level ${input.classificationTier})`
      );
    }

    // Optional SBU alignment check for non-superadmins
    if (custodian.sbu && custodian.sbu !== input.sbu && callerUser?.role !== 'ADMIN') {
      throw new ApiError(
        400,
        `Custodian belongs to ${custodian.sbu}, which does not match asset SBU ${input.sbu}`
      );
    }

    // 3. Pin Asset Specifications & Metadata to IPFS
    const ipfsPayload = {
      name: input.name,
      classificationTier: input.classificationTier,
      sbu: input.sbu,
      initialCustodian: {
        id: custodian.id,
        walletAddress: custodian.walletAddress,
        externalId: custodian.externalId,
        displayName: custodian.displayName,
      },
      metadata: input.metadata || {},
      mintedAt: new Date().toISOString(),
      mintedBy: {
        id: callerUser?.id,
        walletAddress: callerUser?.walletAddress,
        role: callerUser?.role,
      },
    };

    // Encrypted with the same AES-256-GCM envelope as identity dossiers before
    // it leaves the process: an asset spec names its custodian and carries the
    // classification tier and serial numbers, so pinning it in clear would put
    // exactly the data the chain deliberately keeps off itself onto a public
    // gateway. Only the CID is recorded on-chain and cached in Postgres.
    const cid = await ipfsService.pinJson(encryptDossier(ipfsPayload), {
      name: `asset-${input.name.replace(/\s+/g, '-').toLowerCase()}`,
    });

    // 4. On-chain Minting via Smart Contract (Soulbound Custody Token)
    const chainResult = await chainService.mintAssetOnChain({
      custodianWallet: custodian.walletAddress,
      assetTag: input.metadata?.assetTag || input.name,
      serialNumber: typeof input.metadata?.serialNumber === 'string' ? input.metadata.serialNumber : undefined,
      classificationTier: input.classificationTier,
      sbu: input.sbu,
      ipfsCid: cid,
    });

    // A contract that is configured but rejected/failed the mint must not be
    // papered over with an off-chain-only row; only an unconfigured contract
    // (no error reported) falls back to the off-chain cache.
    if (chainResult.error) {
      throw new ApiError(502, `On-chain mint failed: ${chainResult.error}`);
    }

    if (!chainResult.confirmed) {
      logger.warn(
        `Asset "${input.name}" minted off-chain with IPFS CID ${cid} pending smart contract integration.`
      );
    }

    // The on-chain token id is authoritative. A caller-supplied tokenId is only
    // honoured for off-chain-only rows, and never replaces an existing asset.
    const resolvedTokenId = chainResult.confirmed
      ? (chainResult.tokenId ? String(chainResult.tokenId) : null)
      : input.tokenId || null;

    if (!chainResult.confirmed && resolvedTokenId) {
      const clash = await prisma.asset.findUnique({ where: { tokenId: resolvedTokenId }, select: { id: true } });
      if (clash) {
        throw new ApiError(409, `An asset with token ID ${resolvedTokenId} already exists`);
      }
    }

    // 5. Persist Asset in PostgreSQL Cache (upsert for on-chain minted assets to guarantee idempotency)
    const assetPayload = {
      name: input.name,
      tokenId: resolvedTokenId,
      cid,
      classificationTier: input.classificationTier,
      sbu: input.sbu,
      metadata: input.metadata || {},
      mintTxHash: chainResult.txHash,
      ownerId: custodian.id,
    };

    const assetInclude = {
      owner: {
        select: {
          id: true,
          displayName: true,
          externalId: true,
          walletAddress: true,
          role: true,
          clearanceLevel: true,
          sbu: true,
        },
      },
    };

    let asset;
    if (resolvedTokenId) {
      asset = await prisma.asset.upsert({
        where: { tokenId: resolvedTokenId },
        update: assetPayload,
        create: assetPayload,
        include: assetInclude,
      });
    } else {
      asset = await prisma.asset.create({
        data: assetPayload,
        include: assetInclude,
      });
    }

    // 6. Log Immutable Audit Trail Event
    await auditService
      .recordEvent({
        type: 'ASSET_MINTED',
        // Sessions without a DB identity (e.g. the ADMIN_WALLETS dev override)
        // carry a wallet address as their id, which can't be an actor FK.
        actorId: callerUser?.isRegistered === false ? null : callerUser?.id,
        targetId: asset.id,
        txHash: chainResult.txHash || `0xoffchain_${Date.now().toString(16)}`,
        blockNumber: chainResult.blockNumber,
        payload: {
          assetId: asset.id,
          name: asset.name,
          classificationTier: asset.classificationTier,
          sbu: asset.sbu,
          cid,
          custodianId: custodian.id,
          custodianWallet: custodian.walletAddress,
        },
      })
      .catch((err) => logger.warn(`Failed to create audit log for asset mint: ${err.message}`));

    return { asset, chain: chainResult };
  },

  /**
   * List assets currently in the caller's custody
   */
  async getMyAssets(callerUser) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    if (!callerUser || !callerUser.id) {
      throw new ApiError(401, 'Authentication required to view custody assets');
    }

    const assets = await prisma.asset.findMany({
      where: { ownerId: callerUser.id },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            displayName: true,
            externalId: true,
            walletAddress: true,
            role: true,
            clearanceLevel: true,
            sbu: true,
          },
        },
        // The one PENDING request (there can only be one — requestTransfer
        // refuses a second) so the UI can show "transfer pending" instead of
        // a fabricated status, and disable requesting another one.
        transferRequests: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            createdAt: true,
            toUser: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    return assets.map(({ transferRequests, ...asset }) => ({
      ...asset,
      pendingTransfer: transferRequests[0] || null,
    }));
  },

  /**
   * Fetch single asset details with soulbound custody history and audit events
   */
  async getAssetById(assetId, callerUser) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const asset = await prisma.asset.findFirst({
      where: {
        OR: [{ id: assetId }, { tokenId: assetId }],
      },
      include: {
        owner: {
          select: {
            id: true,
            displayName: true,
            externalId: true,
            walletAddress: true,
            role: true,
            clearanceLevel: true,
            sbu: true,
          },
        },
        transferRequests: {
          orderBy: { createdAt: 'desc' },
          include: {
            fromUser: { select: { id: true, displayName: true, walletAddress: true } },
            toUser: { select: { id: true, displayName: true, walletAddress: true } },
            requestedBy: { select: { id: true, displayName: true } },
            approvedBy: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    if (!asset) {
      throw new ApiError(404, 'Asset not found');
    }

    // Admins and auditors may open any asset. Everyone else needs to have held
    // it or been party to a custody transfer of it; managers may also open
    // assets within their SBU scope (own SBU + active cross-SBU passes).
    const scope = callerUser ? await scopeService.getSbuScope(callerUser) : null;
    if (scope) {
      const involved =
        asset.ownerId === callerUser.id ||
        asset.transferRequests.some((tr) =>
          [tr.fromUser?.id, tr.toUser?.id, tr.requestedBy?.id].includes(callerUser.id)
        );
      const inScope = callerUser.role === 'MANAGER' && scopeService.isAssetVisible(scope, asset);
      if (!involved && !inScope) {
        throw new ApiError(
          403,
          callerUser.role === 'MANAGER'
            ? 'This asset is outside your SBU'
            : 'You can only view assets that are or were in your custody'
        );
      }
    }

    // Retrieve related audit events for this asset
    const auditLogs = await prisma.auditEvent.findMany({
      where: { targetId: asset.id },
      orderBy: { createdAt: 'asc' },
      include: {
        actor: {
          select: {
            id: true,
            displayName: true,
            walletAddress: true,
            role: true,
          },
        },
      },
    });

    // Structure soulbound custody history
    const custodyHistory = [
      {
        event: 'MINTED_AND_ASSIGNED',
        custodian: asset.owner,
        timestamp: asset.createdAt,
        txHash: asset.mintTxHash,
        cid: asset.cid,
      },
      ...asset.transferRequests
        .filter((tr) => tr.status === 'EXECUTED')
        .map((tr) => ({
          event: 'CUSTODY_TRANSFERRED',
          from: tr.fromUser,
          to: tr.toUser,
          approvedBy: tr.approvedBy,
          timestamp: tr.updatedAt,
          txHash: tr.txHash,
        })),
    ];

    return {
      ...asset,
      custodyHistory,
      auditLogs: auditLogs.map((log) => ({
        id: log.id,
        type: log.type,
        actor: log.actor,
        txHash: log.txHash,
        blockNumber: log.blockNumber ? log.blockNumber.toString() : '0',
        payload: log.payload,
        createdAt: log.createdAt,
      })),
    };
  },

  /**
   * Admin / Manager / Auditor: List & search assets with filters and pagination.
   * Admin and Auditor see every SBU; a Manager only sees their SBU scope.
   */
  async listAssets(callerUser, query) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {};

    const scope = await scopeService.getSbuScope(callerUser);
    if (scope) where.AND = [scopeService.assetWhere(scope)];

    if (query.sbu) {
      where.sbu = query.sbu;
    }

    if (query.classificationTier) {
      where.classificationTier = parseInt(query.classificationTier, 10);
    }

    if (query.ownerId) {
      where.ownerId = query.ownerId;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { tokenId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, assets] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: {
            select: {
              id: true,
              displayName: true,
              externalId: true,
              walletAddress: true,
              role: true,
              clearanceLevel: true,
              sbu: true,
            },
          },
        },
      }),
    ]);

    return {
      assets,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};

export default assetService;
