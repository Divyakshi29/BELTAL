import express from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import validate from '../middleware/validate.js';
import { machineIngestLimiter, pacsConsoleLimiter } from '../middleware/machineRateLimit.js';
import pacsController from '../controllers/pacs.controller.js';
import {
  badgeEventSchema,
  lockdownSchema,
  simulateTapSchema,
  listEventsQuerySchema,
} from '../validators/pacs.validator.js';

const router = express.Router();

/**
 * Badge-tap ingest — invoked on every PACS reader event. Machine-only
 * (ROLE_SYSTEM_CONNECTOR), with its own rate limit distinct from the human
 * apiLimiter in app.js (issue #74).
 */
router.post(
  '/badge-event',
  machineIngestLimiter,
  authenticate,
  requireRole('SYSTEM_CONNECTOR'),
  validate(badgeEventSchema),
  pacsController.badgeEvent
);

/**
 * DEMO ONLY — simulated badge tap for the frontend PACS simulator. The real
 * ingest above is machine-only, which a human browser session cannot use, so
 * this lets an ADMIN/MANAGER trigger the same decision + logging path.
 */
router.post(
  '/simulate-tap',
  authenticate,
  requireRole('ADMIN', 'MANAGER'),
  validate(simulateTapSchema),
  pacsController.simulateTap
);

/**
 * Facility zones with lockdown state and recent badge events, for the PACS
 * console. These are polled by the simulator UI, so they use a dedicated
 * limiter (skipped by the human apiLimiter in app.js) instead of eating the
 * 100-per-15-minutes budget.
 */
router.get(
  '/zones',
  pacsConsoleLimiter,
  authenticate,
  requireRole('ADMIN', 'MANAGER', 'AUDITOR'),
  pacsController.listZones
);

router.get(
  '/events',
  pacsConsoleLimiter,
  authenticate,
  requireRole('ADMIN', 'MANAGER', 'AUDITOR'),
  validate(listEventsQuerySchema, 'query'),
  pacsController.listEvents
);

/**
 * Emergency lockdown toggle for a facility zone — admin only (issue #76).
 */
router.patch(
  '/zones/:zoneId/lockdown',
  authenticate,
  requireRole('ADMIN'),
  validate(lockdownSchema),
  pacsController.setZoneLockdown
);

export default router;
