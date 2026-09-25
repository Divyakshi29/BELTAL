import { Router } from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import validate from '../middleware/validate.js';
import { assistantQueryLimiter } from '../middleware/assistantRateLimit.js';
import { assistantQuerySchema } from '../validators/assistant.validator.js';
import assistantService from '../services/assistant.service.js';

const router = Router();

/**
 * GET /api/assistant/status — whether the assistant is usable on this
 * deployment, so the UI can hide the panel instead of offering a button that
 * always fails when no API key is configured.
 */
router.get('/status', authenticate, requireRole('ADMIN', 'AUDITOR'), (req, res) => {
  res.status(200).json({ success: true, data: { configured: assistantService.isConfigured() } });
});

/**
 * POST /api/assistant/query — ask a natural-language question about the audit
 * trail (issue #50).
 *
 * Gated to ADMIN and AUDITOR, exactly matching /api/audit. The assistant
 * reaches the audit trail through the same service those routes use, so it can
 * never surface a record its caller could not already read directly.
 */
router.post(
  '/query',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  assistantQueryLimiter,
  validate(assistantQuerySchema),
  async (req, res, next) => {
    try {
      const result = await assistantService.answerQuery({ question: req.body.question });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
