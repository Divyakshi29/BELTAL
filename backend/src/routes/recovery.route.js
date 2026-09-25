import { Router } from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import validate from '../middleware/validate.js';
import recoveryService from '../services/recovery.service.js';
import {
  addGuardianSchema,
  requestRecoverySchema,
  rejectRecoverySchema,
  listRecoveryQuerySchema,
} from '../validators/recovery.validator.js';

const router = Router();

router.use(authenticate);

/**
 * Guardian-based account recovery (issue #51).
 *
 * Who may do what:
 *  - assigning and removing guardians is ADMIN only;
 *  - raising a request is ADMIN or one of the identity's own guardians;
 *  - approving is guardians only, and never the person who raised it;
 *  - executing the on-chain re-link is ADMIN only, and only after the
 *    guardian threshold has been met.
 * The service enforces each of these; the route gates cover the coarse cases.
 */

// ── Guardian roster ──
router.get('/guardians/:userId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await recoveryService.listGuardians(req.params.userId) });
  } catch (err) { next(err); }
});

router.post(
  '/guardians/:userId',
  requireRole('ADMIN'),
  validate(addGuardianSchema),
  async (req, res, next) => {
    try {
      const guardian = await recoveryService.addGuardian(req.params.userId, req.body.guardianId);
      res.status(201).json({ success: true, data: guardian });
    } catch (err) { next(err); }
  }
);

router.delete('/guardians/:userId/:guardianId', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const result = await recoveryService.removeGuardian(req.params.userId, req.params.guardianId);
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── Recovery requests ──
router.get('/', requireRole('ADMIN', 'AUDITOR'), validate(listRecoveryQuerySchema, 'query'), async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await recoveryService.listRequests(req.query) });
  } catch (err) { next(err); }
});

// Readable by the people involved — the subject, whoever raised it, an
// assigned guardian — plus oversight roles. Enforced in the service, since a
// guardian may hold any role including plain USER.
router.get('/:id', async (req, res, next) => {
  try {
    const request = await recoveryService.getRequest(req.params.id, req.user);
    res.status(200).json({ success: true, data: request });
  } catch (err) { next(err); }
});

// Role gate is deliberately open here: the service decides, because a guardian
// may be any role, including a plain USER.
router.post('/', validate(requestRecoverySchema), async (req, res, next) => {
  try {
    const request = await recoveryService.requestRecovery(req.user, req.body);
    res.status(201).json({ success: true, data: request });
  } catch (err) { next(err); }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await recoveryService.approveRecovery(req.user, req.params.id) });
  } catch (err) { next(err); }
});

router.post('/:id/reject', validate(rejectRecoverySchema), async (req, res, next) => {
  try {
    const result = await recoveryService.rejectRecovery(req.user, req.params.id, req.body.rejectionReason);
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post('/:id/execute', requireRole('ADMIN'), async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await recoveryService.executeRecovery(req.params.id) });
  } catch (err) { next(err); }
});

export default router;
