import express from 'express';
import authController from '../controllers/auth.controller.js';
import validate from '../middleware/validate.js';
import { authenticateUnregistered } from '../middleware/auth.middleware.js';
import { registrationSubmitLimiter, registrationStatusLimiter } from '../middleware/registrationRateLimit.js';
import { nonceSchema, verifySchema, registerSchema } from '../validators/auth.validator.js';

const router = express.Router();

// Request single-use challenge nonce
router.post('/nonce', validate(nonceSchema), authController.getNonce);

// Verify signature and issue JWT
router.post('/verify', validate(verifySchema), authController.verify);
router.post('/login', validate(verifySchema), authController.verify);

// Machine login for the ROLE_SYSTEM_CONNECTOR custodial identity (issue #74).
// Requests a nonce the same way (POST /nonce) but exchanges the signature
// here rather than /verify, since /verify explicitly rejects
// SYSTEM_CONNECTOR identities.
router.post('/system-connector/verify', validate(verifySchema), authController.verifySystemConnector);

// Self-registration for wallets with no identity yet. Only the limited
// (unregistered) session is accepted here; every other route rejects it. Each has
// its own per-IP limiter, applied before authentication so floods are cut early.
router.post(
  '/register',
  registrationSubmitLimiter,
  authenticateUnregistered,
  validate(registerSchema),
  authController.register
);
router.get(
  '/registration-status',
  registrationStatusLimiter,
  authenticateUnregistered,
  authController.registrationStatus
);

export default router;
