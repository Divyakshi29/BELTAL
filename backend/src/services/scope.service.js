import prisma from '../config/db.js';

// ADMIN is unrestricted and AUDITOR is read-only across every SBU (spec: full
// audit read access). Everyone else is confined to their own SBU plus whatever
// an active Cross-SBU pass opens for them.
const UNRESTRICTED_ROLES = ['ADMIN', 'AUDITOR'];

/**
 * The one place SBU confinement is defined. Read scope = own SBU + SBUs the
 * caller holds an active pass for; action scope (canManageSbu) = own SBU only,
 * so a pass gives visibility but never approval authority over another SBU.
 * A caller with no SBU claim fails closed (sees and manages nothing).
 */
export const scopeService = {
  /**
   * `null` means unrestricted; otherwise `{ ownSbu, sbus }` where `sbus` is the
   * own SBU plus the target SBU of each of the caller's active passes.
   */
  async getSbuScope(user) {
    if (UNRESTRICTED_ROLES.includes(user?.role)) return null;

    const ownSbu = user?.sbu || null;
    const passes =
      prisma && user?.id
        ? await prisma.crossSbuPass.findMany({
            where: { userId: user.id, validUntil: { gt: new Date() } },
            select: { targetSbu: true },
          })
        : [];

    return { ownSbu, sbus: [...new Set([ownSbu, ...passes.map((p) => p.targetSbu)].filter(Boolean))] };
  },

  /** Prisma `where` for assets visible under `scope`: in scope by SBU, or held by the caller's own SBU. */
  assetWhere(scope) {
    if (!scope) return {};
    return {
      OR: [
        { sbu: { in: scope.sbus } },
        ...(scope.ownSbu ? [{ owner: { sbu: scope.ownSbu } }] : []),
      ],
    };
  },

  /** Prisma `where` for transfer requests visible under `scope`. */
  transferWhere(scope) {
    if (!scope) return {};
    return {
      OR: [
        { asset: scopeService.assetWhere(scope) },
        ...(scope.ownSbu ? [{ fromUser: { sbu: scope.ownSbu } }, { toUser: { sbu: scope.ownSbu } }] : []),
      ],
    };
  },

  /** In-memory twin of assetWhere; `asset.owner.sbu` must be loaded. */
  isAssetVisible(scope, asset) {
    if (!scope) return true;
    return scope.sbus.includes(asset.sbu) || Boolean(scope.ownSbu && asset.owner?.sbu === scope.ownSbu);
  },

  /** Whether the caller may act (request/approve/reject/issue) on data of `sbu`. */
  canManageSbu(user, sbu) {
    if (user?.role === 'ADMIN') return true;
    return user?.role === 'MANAGER' && Boolean(user.sbu) && user.sbu === sbu;
  },
};

export default scopeService;
