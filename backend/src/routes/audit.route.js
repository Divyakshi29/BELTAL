import { Router } from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import validate from '../middleware/validate.js';
import auditService from '../services/audit.service.js';
import { auditQuerySchema, auditStatsQuerySchema } from '../validators/audit.validator.js';

const router = Router();

// The trail is unscoped across every SBU, and the spec gives Managers no audit
// view (only the Auditor), so these routes are ADMIN/AUDITOR only.

/**
 * GET /api/audit
 * Paginated, filterable unified audit trail (AuditEvent + PacsBadgeEvent).
 * Query params: type, actorId, targetId, txHash, from, to, page, limit
 * (actionType, actor, asset, startDate, endDate are accepted as aliases).
 */
router.get(
  '/',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  validate(auditQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const result = await auditService.getAuditTrail(req.query);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/audit/stats
 * Headline event counts for the auditor dashboard, optionally date-bounded.
 */
router.get(
  '/stats',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  validate(auditStatsQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const stats = await auditService.getAuditStats(req.query);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/audit/verify/:id
 * Check a single audit record's transaction against the chain.
 */
router.get(
  '/verify/:id',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  async (req, res, next) => {
    try {
      const result = await auditService.verifyAuditEvent(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/audit/:id
 * Fetch a single AuditEvent by UUID.
 */
router.get(
  '/:id',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  async (req, res, next) => {
    try {
      const event = await auditService.getAuditEventById(req.params.id);
      res.json({ success: true, data: event });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
