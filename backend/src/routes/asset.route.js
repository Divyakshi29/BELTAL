import express from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import validate from '../middleware/validate.js';
import assetController from '../controllers/asset.controller.js';
import { createAssetSchema, getAssetsQuerySchema } from '../validators/asset.validator.js';

const router = express.Router();

/**
 * Mint a new asset NFT and assign custody
 * Restricted to ADMIN and MANAGER
 */
router.post(
  '/',
  authenticate,
  requireRole('ADMIN', 'MANAGER'),
  validate(createAssetSchema),
  assetController.mintAsset
);

/**
 * List assets in the caller's personal custody
 * Available to any authenticated user
 */
router.get('/me', authenticate, assetController.getMyAssets);
router.get('/my', authenticate, assetController.getMyAssets);

/**
 * List & search all assets
 * Restricted to ADMIN, MANAGER, and AUDITOR
 */
router.get(
  '/',
  authenticate,
  requireRole('ADMIN', 'MANAGER', 'AUDITOR'),
  validate(getAssetsQuerySchema, 'query'),
  assetController.listAssets
);

/**
 * Fetch one asset's details plus custody history
 * Available to any authenticated user
 */
router.get('/:id', authenticate, assetController.getAssetById);

export default router;
