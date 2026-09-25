import { Router } from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import tamperService from '../services/tamper.service.js';
import validate from '../middleware/validate.js';
import { tamperTargetSchema } from '../validators/verify.validator.js';
import ApiError from '../utils/ApiError.js';

const router = Router();

/**
 * POST /api/verify/anti-tamper
 * Flagship auditor anti-tamper check.
 * Body: { assetId?: string, employeeId?: string }
 *
 * At least one of assetId or employeeId must be provided.
 * Runs both checks if both are provided.
 */
router.post(
  '/anti-tamper',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  async (req, res, next) => {
    try {
      const { assetId, employeeId } = req.body ?? {};

      if (!assetId && !employeeId) {
        return next(new ApiError(400, 'Provide at least one of: assetId, employeeId'));
      }

      const results = {};

      if (assetId) {
        results.asset = await tamperService.verifyAssetIntegrity(assetId);
      }

      if (employeeId) {
        results.identity = await tamperService.verifyIdentityIntegrity(employeeId);
      }

      // Overall verdict across all checks
      const allOk = Object.values(results).every(
        (r) => r.verdict === 'INTEGRITY_OK'
      );
      const anyCompromised = Object.values(results).some(
        (r) => r.verdict === 'INTEGRITY_COMPROMISED'
      );

      const overallVerdict = anyCompromised
        ? 'INTEGRITY_COMPROMISED'
        : allOk
          ? 'INTEGRITY_OK'
          : 'PARTIAL';

      res.json({
        overallVerdict,
        checkedAt: new Date().toISOString(),
        results,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/verify/tx/:txHash
 * Verify an Ethereum Sepolia transaction directly against the chain.
 * Returns receipt, block, status and Etherscan link.
 */
router.get(
  '/tx/:txHash',
  authenticate,
  requireRole('ADMIN', 'AUDITOR', 'MANAGER'),
  async (req, res, next) => {
    try {
      const { txHash } = req.params;
      if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
        return next(new ApiError(400, 'Invalid transaction hash format'));
      }
      const result = await tamperService.verifyTransaction(txHash);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/verify/asset/:assetId
 * Quick on-chain integrity check for a single asset (GET convenience alias).
 */
router.get(
  '/asset/:assetId',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  async (req, res, next) => {
    try {
      const report = await tamperService.verifyAssetIntegrity(req.params.assetId);
      res.json(report);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/verify/identity/:employeeId
 * Quick IPFS+hash integrity check for a single employee identity (GET convenience alias).
 */
router.get(
  '/identity/:employeeId',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  async (req, res, next) => {
    try {
      const report = await tamperService.verifyIdentityIntegrity(req.params.employeeId);
      res.json(report);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DEMO ONLY: POST /api/verify/simulate-tamper
 * Plays the rogue insider for the Anti-Tamper Lab: rewrites one value in the
 * Postgres cache (identity clearance / asset classification tier) without
 * touching the chain, so the next audit check flags it. Off in production
 * unless ENABLE_TAMPER_SIMULATION=true.
 * Body: { kind: 'identity' | 'asset', id: string }
 */
router.post(
  '/simulate-tamper',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  validate(tamperTargetSchema),
  async (req, res, next) => {
    try {
      const result = await tamperService.simulateTamper(req.body, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DEMO ONLY: POST /api/verify/restore
 * Undoes a simulated tamper by copying the on-chain value back into the cache.
 * Never writes to the chain.
 */
router.post(
  '/restore',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  validate(tamperTargetSchema),
  async (req, res, next) => {
    try {
      const result = await tamperService.restoreFromChain(req.body, req.user);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
