import express from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import validate from '../middleware/validate.js';
import transferController from '../controllers/transfer.controller.js';
import {
  createTransferRequestSchema,
  listTransfersQuerySchema,
  rejectTransferSchema,
} from '../validators/transfer.validator.js';

const router = express.Router();

/**
 * Request custody handover of an asset
 * Available to authenticated users holding the asset, or Admin/Manager
 */
router.post(
  '/request',
  authenticate,
  validate(createTransferRequestSchema),
  transferController.requestTransfer
);

/**
 * List transfer requests with query filtering
 */
router.get(
  '/',
  authenticate,
  validate(listTransfersQuerySchema, 'query'),
  transferController.listTransfers
);

/**
 * Approve & execute custody handover on-chain and in DB cache
 * Restricted to ADMIN and MANAGER. PATCH is accepted alongside POST because
 * the web client issues it as a state change on the request.
 */
router
  .route('/:id/approve')
  .post(authenticate, requireRole('ADMIN', 'MANAGER'), transferController.approveTransfer)
  .patch(authenticate, requireRole('ADMIN', 'MANAGER'), transferController.approveTransfer);

/**
 * Reject a custody handover request
 * Accessible to ADMIN, MANAGER, or original custodian
 */
router
  .route('/:id/reject')
  .post(authenticate, validate(rejectTransferSchema), transferController.rejectTransfer)
  .patch(authenticate, validate(rejectTransferSchema), transferController.rejectTransfer);

export default router;
