import passService from '../services/pass.service.js';
import ApiError from '../utils/ApiError.js';

const PASS_READ_ROLES = ['ADMIN', 'MANAGER', 'AUDITOR'];

export const passController = {
  /**
   * POST /api/passes/cross-sbu — Grant time-boxed Cross-SBU pass (Admin/Manager)
   */
  async grantCrossSbuPass(req, res, next) {
    try {
      const pass = await passService.grantCrossSbuPass(req.user, req.body);
      return res.status(201).json({
        success: true,
        data: pass,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/passes/cross-sbu/active/:userId — Get active passes for user
   */
  async getActivePasses(req, res, next) {
    try {
      const targetUserId = req.params.userId || req.user.id;
      // Personnel may only look up their own passes; oversight roles can see anyone's.
      if (targetUserId !== req.user.id && !PASS_READ_ROLES.includes(req.user.role)) {
        throw new ApiError(403, 'You can only view your own cross-SBU passes');
      }
      const passes = await passService.getActivePassesForUser(targetUserId, req.user);
      return res.status(200).json({
        success: true,
        data: passes,
      });
    } catch (err) {
      next(err);
    }
  },
};

export default passController;
