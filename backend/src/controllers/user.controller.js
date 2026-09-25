import prisma from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import scopeService from '../services/scope.service.js';

export const userController = {
  /**
   * GET /api/users/me — the caller's own identity, role, and wallet address.
   */
  async getMe(req, res, next) {
    try {
      if (!req.user.isRegistered) {
        throw new ApiError(404, 'No identity registered for this wallet yet');
      }
      if (!prisma) {
        throw new ApiError(503, 'Database unavailable');
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { manager: { select: { id: true, displayName: true, seniorityGrade: true } } },
      });
      if (!user) {
        throw new ApiError(404, 'Identity not found');
      }

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
          seniorityGrade: user.seniorityGrade,
          manager: user.manager,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/users/transfer-recipients — candidate recipients other than the
   * caller, for the transfer forms, cross-SBU pass issuance and the PACS badge
   * simulator's employee directory.
   *
   * Scope: Admin/Auditor see everyone. Users and Managers see personnel of their
   * own SBU (plus SBUs opened by their active cross-SBU passes) and visitors
   * holding an active pass into their SBU. Only the fields the forms render are
   * returned; role and wallet address go to oversight roles (the manager roster
   * shows and searches them), never to plain users.
   *
   * SYSTEM_CONNECTOR (a machine-only identity) is never eligible here. With
   * `?custodyOnly=true` (the asset-transfer recipient picker), AUDITOR is
   * excluded too — auditors are read-only and were never meant to hold asset
   * custody, unlike a pass or a badge-tap, which are about physical/zone
   * access rather than owning equipment.
   */
  async listTransferRecipients(req, res, next) {
    try {
      if (!prisma) {
        throw new ApiError(503, 'Database unavailable');
      }

      const requestedLimit = Number.parseInt(req.query.limit, 10);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 100)
        : 100;

      const custodyOnly = req.query.custodyOnly === 'true';
      const excludedRoles = custodyOnly ? ['SYSTEM_CONNECTOR', 'AUDITOR'] : ['SYSTEM_CONNECTOR'];

      // A revoked identity cannot take custody (the contract rejects it), so
      // do not offer it as a recipient.
      const where = { id: { not: req.user.id }, revokedAt: null, role: { notIn: excludedRoles } };
      const scope = await scopeService.getSbuScope(req.user);
      if (scope) {
        where.OR = [
          { sbu: { in: scope.sbus } },
          ...(scope.ownSbu
            ? [{ crossSbuPasses: { some: { targetSbu: scope.ownSbu, validUntil: { gt: new Date() } } } }]
            : []),
        ];
      }

      const showIdentity = ['ADMIN', 'MANAGER', 'AUDITOR'].includes(req.user.role);
      const users = await prisma.user.findMany({
        where,
        take: limit,
        orderBy: { displayName: 'asc' },
        select: {
          id: true,
          displayName: true,
          did: true,
          clearanceLevel: true,
          sbu: true,
          ...(showIdentity
            ? {
                walletAddress: true,
                role: true,
                seniorityGrade: true,
                managerId: true,
                manager: { select: { id: true, displayName: true } },
              }
            : {}),
        },
      });

      return res.status(200).json({ success: true, data: { users } });
    } catch (err) {
      next(err);
    }
  },
};

export default userController;
