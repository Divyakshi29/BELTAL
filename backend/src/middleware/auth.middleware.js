import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import prisma from '../config/db.js';
import ApiError from '../utils/ApiError.js';

/**
 * Verifies the JWT issued at wallet sign-in and attaches the claims to
 * req.user (id, walletAddress, role, clearanceLevel, sbu, isRegistered).
 *
 * The isRegistered claim is enforced here, once, for every route: a wallet
 * with no identity gets a limited session (no role) that is rejected by
 * `authenticate` and only accepted by `authenticateUnregistered`, which
 * guards the self-registration endpoints and nothing else.
 *
 * Revocation is the one thing checked against the database on every request
 * (a single primary-key lookup). The JWT is otherwise trusted for its lifetime,
 * but a quarantined identity must lose access immediately, not when the token
 * happens to expire. Role and clearance changes still take effect at the next
 * sign-in.
 */
function verifyToken({ registered }) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return next(new ApiError(401, 'Missing or malformed Authorization header'));
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new ApiError(401, 'Session expired, please sign in again'));
      }
      return next(new ApiError(401, 'Invalid authentication token'));
    }

    if ((payload.isRegistered === true) !== registered) {
      return next(
        registered
          ? new ApiError(403, 'No identity registered for this wallet yet — submit a registration request')
          : new ApiError(403, 'This wallet already has a registered identity')
      );
    }

    if (registered && prisma) {
      try {
        const account = await prisma.user.findUnique({ where: { id: payload.sub }, select: { revokedAt: true } });
        if (!account) return next(new ApiError(401, 'This identity no longer exists, please sign in again'));
        if (account.revokedAt) {
          return next(new ApiError(403, 'This identity has been revoked. Contact your security administrator.'));
        }
      } catch (err) {
        return next(err);
      }
    }

    req.user = {
      id: payload.sub,
      walletAddress: payload.walletAddress,
      role: payload.role,
      clearanceLevel: payload.clearanceLevel,
      sbu: payload.sbu,
      isRegistered: payload.isRegistered,
    };
    return next();
  };
}

export const authenticate = verifyToken({ registered: true });
export const authenticateUnregistered = verifyToken({ registered: false });

export default authenticate;
