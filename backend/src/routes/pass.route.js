import express from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import validate from '../middleware/validate.js';
import passController from '../controllers/pass.controller.js';
import { createCrossSbuPassSchema } from '../validators/pass.validator.js';

const router = express.Router();

/**
 * Grant a time-boxed Cross-SBU access pass
 * Restricted to ADMIN and MANAGER
 */
router.post(
  '/cross-sbu',
  authenticate,
  requireRole('ADMIN', 'MANAGER'),
  validate(createCrossSbuPassSchema),
  passController.grantCrossSbuPass
);

/**
 * Get active cross-SBU passes for a user
 */
router.get(
  '/cross-sbu/active/:userId',
  authenticate,
  passController.getActivePasses
);

export default router;
