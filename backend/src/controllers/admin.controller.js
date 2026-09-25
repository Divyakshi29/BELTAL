import prisma from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import identityService from '../services/identity.service.js';
import registrationService from '../services/registration.service.js';
import chainService from '../services/chain.service.js';
import logger from '../config/logger.js';

export const getStats = async (req, res, next) => {
  try {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    const totalIdentities = await prisma.user.count();
    const activeAssets = await prisma.asset.count();
    const pendingTransfers = await prisma.transferRequest.count({
      where: { status: 'PENDING' }
    });

    res.status(200).json({
      success: true,
      data: {
        totalIdentities,
        activeAssets,
        pendingTransfers,
        consensusHealth: 'NOMINAL' // Hardcoded for now
      }
    });
  } catch (error) {
    next(error);
  }
};

export const listIdentities = async (req, res, next) => {
  try {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    // Already validated/coerced by listIdentitiesQuerySchema
    const { search, sbu, clearance, status, page, limit } = req.query;

    const where = {};
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { walletAddress: { contains: search, mode: 'insensitive' } },
        { externalId: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (sbu) where.sbu = sbu;
    if (clearance) where.clearanceLevel = clearance;
    if (status === 'REVOKED') where.revokedAt = { not: null };
    if (status === 'ACTIVE') where.revokedAt = null;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          walletAddress: true,
          externalId: true,
          did: true,
          displayName: true,
          role: true,
          clearanceLevel: true,
          sbu: true,
          seniorityGrade: true,
          managerId: true,
          manager: { select: { id: true, displayName: true } },
          revokedAt: true,
          revocationReason: true,
          revokeTxHash: true,
          createdAt: true
        }
      }),
      prisma.user.count({ where })
    ]);

    res.status(200).json({
      success: true,
      data: {
        users,
        total,
        page,
        limit
      }
    });
  } catch (error) {
    next(error);
  }
};

export const registerIdentity = async (req, res, next) => {
  try {
    const { user, chain } = await identityService.registerIdentity(req.body);
    return res.status(201).json({
      success: true,
      data: {
        id: user.id,
        walletAddress: user.walletAddress,
        externalId: user.externalId,
        did: user.did,
        displayName: user.displayName,
        role: user.role,
        clearanceLevel: user.clearanceLevel,
        sbu: user.sbu,
        identityHash: user.identityHash,
        dossierCid: user.dossierCid,
        createdAt: user.createdAt,
        chain,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateRole = async (req, res, next) => {
  try {
    const { user, chain } = await identityService.updateRole(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        role: user.role,
        clearanceLevel: user.clearanceLevel,
        chain,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrgAssignment = async (req, res, next) => {
  try {
    const user = await identityService.updateOrgAssignment(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        managerId: user.managerId,
        manager: user.manager,
        seniorityGrade: user.seniorityGrade,
      },
    });
  } catch (error) {
    next(error);
  }
};

const revocationView = (user, chain) => ({
  id: user.id,
  walletAddress: user.walletAddress,
  did: user.did,
  displayName: user.displayName,
  role: user.role,
  revokedAt: user.revokedAt,
  revocationReason: user.revocationReason,
  revokeTxHash: user.revokeTxHash,
  chain,
});

export const revokeIdentity = async (req, res, next) => {
  try {
    const { user, chain } = await identityService.revokeIdentity(req.user, req.params.id, req.body.reason);
    return res.status(200).json({ success: true, data: revocationView(user, chain) });
  } catch (error) {
    next(error);
  }
};

export const reinstateIdentity = async (req, res, next) => {
  try {
    const { user, chain } = await identityService.reinstateIdentity(req.user, req.params.id);
    return res.status(200).json({ success: true, data: revocationView(user, chain) });
  } catch (error) {
    next(error);
  }
};

export const listRegistrations = async (req, res, next) => {
  try {
    const data = await registrationService.list(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const approveRegistration = async (req, res, next) => {
  try {
    const { user, chain } = await registrationService.approve(req.params.id, req.user.id, req.body);
    return res.status(200).json({
      success: true,
      data: {
        id: user.id,
        walletAddress: user.walletAddress,
        externalId: user.externalId,
        did: user.did,
        displayName: user.displayName,
        role: user.role,
        clearanceLevel: user.clearanceLevel,
        sbu: user.sbu,
        chain,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const rejectRegistration = async (req, res, next) => {
  try {
    const registration = await registrationService.reject(req.params.id, req.user.id, req.body);
    return res.status(200).json({ success: true, data: registration });
  } catch (error) {
    next(error);
  }
};

const zoneResponse = (zone, extra = {}) => ({
  id: zone.id,
  zoneId: zone.zoneId,
  name: zone.name,
  sbu: zone.sbu,
  requiredClearance: zone.requiredClearance,
  isEmergencyLocked: zone.isEmergencyLocked,
  createdAt: zone.createdAt,
  updatedAt: zone.updatedAt,
  ...extra,
});

export const listZones = async (req, res, next) => {
  try {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    const zones = await prisma.facilityZone.findMany({ orderBy: { zoneId: 'asc' } });
    return res.status(200).json({
      success: true,
      data: { zones: zones.map((zone) => zoneResponse(zone)), total: zones.length },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create or update a facility zone by zoneId (full replace: an omitted sbu
 * means the zone admits any SBU). The zone is configured on-chain first; with
 * no AccessControl contract configured it is stored off-chain only, and a real
 * chain failure is a 502 with nothing written.
 */
export const upsertZone = async (req, res, next) => {
  try {
    if (!prisma) throw new ApiError(503, 'Database unavailable');
    const { zoneId, name, requiredClearance } = req.body;
    const sbu = req.body.sbu ?? null;

    const existing = await prisma.facilityZone.findUnique({ where: { zoneId } });

    const chainResult = await chainService.configureZoneOnChain({ zoneId, requiredClearance, sbu });
    if (chainResult.error) {
      throw new ApiError(502, `On-chain zone configuration failed: ${chainResult.error}`);
    }
    if (!chainResult.confirmed) {
      logger.warn(`Zone ${zoneId} stored off-chain only pending contract integration.`);
    }

    // createZone() on the contract clears the lockdown flag, so a zone that was
    // locked is re-locked to keep an edit from silently reopening it.
    let isEmergencyLocked = existing?.isEmergencyLocked ?? false;
    if (chainResult.confirmed && isEmergencyLocked) {
      const relock = await chainService.toggleEmergencyLockdownOnChain({ zoneId, status: true });
      if (relock.error) {
        await prisma.facilityZone.update({
          where: { zoneId },
          data: { name, sbu, requiredClearance, isEmergencyLocked: false },
        });
        throw new ApiError(
          502,
          `Zone ${zoneId} was reconfigured on-chain but re-applying its emergency lockdown failed: ${relock.error}. The zone is currently unlocked; lock it again from the PACS lockdown control.`
        );
      }
    }

    const zone = await prisma.facilityZone.upsert({
      where: { zoneId },
      create: { zoneId, name, sbu, requiredClearance },
      update: { name, sbu, requiredClearance, isEmergencyLocked },
    });

    return res.status(existing ? 200 : 201).json({
      success: true,
      data: zoneResponse(zone, { created: !existing, chain: chainResult }),
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getStats,
  listIdentities,
  registerIdentity,
  updateRole,
  updateOrgAssignment,
  revokeIdentity,
  reinstateIdentity,
  listRegistrations,
  approveRegistration,
  rejectRegistration,
  listZones,
  upsertZone,
};
