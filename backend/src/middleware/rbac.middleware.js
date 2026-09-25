import ApiError from '../utils/ApiError.js';

/**
 * Restricts a route to one or more roles. Independent of requireClearance /
 * requireSbuMatch below — TrustChain spec alignment (#43) calls for clearance
 * and SBU to be separate guards, not folded into the role check.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    const normalizedRoles = allowedRoles.flat().map((role) => String(role).toUpperCase());
    const userRole = String(req.user.role ?? '').toUpperCase();
    if (!normalizedRoles.includes(userRole)) {
      return next(new ApiError(403, `Requires one of roles: ${normalizedRoles.join(', ')}`));
    }
    return next();
  };
}

/**
 * Restricts a route by minimum clearance level. `minClearance` may be a
 * number or a `(req) => number` function for resource-dependent thresholds
 * (e.g. a FacilityZone's requiredClearance). Returning null/undefined from
 * the function means "no clearance requirement".
 */
export function requireClearance(minClearance) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    const required = typeof minClearance === 'function' ? minClearance(req) : minClearance;
    if (required == null) return next();
    if ((req.user.clearanceLevel ?? 0) < required) {
      return next(new ApiError(403, `Insufficient clearance level (requires ${required})`));
    }
    return next();
  };
}

/**
 * Restricts a route to requesters whose SBU matches the resource's SBU.
 * `getRequiredSbu` may be a value or a `(req) => Sbu | null` function;
 * null/undefined means "no SBU restriction" (e.g. a shared FacilityZone).
 *
 * NOTE: the spec update for #43 calls for this check to be bypassed "unless a
 * temporary cross-department pass is active". There is no schema/model for
 * such a pass yet, so this always enforces a strict match for now.
 */
export function requireSbuMatch(getRequiredSbu) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    const requiredSbu = typeof getRequiredSbu === 'function' ? getRequiredSbu(req) : getRequiredSbu;
    if (!requiredSbu) return next();
    if (req.user.sbu !== requiredSbu) {
      return next(new ApiError(403, `Requires SBU ${requiredSbu}`));
    }
    return next();
  };
}

export default { requireRole, requireClearance, requireSbuMatch };
