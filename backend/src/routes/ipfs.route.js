import { Router } from 'express';
import authenticate from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import ipfsService from '../services/ipfs.service.js';
import { decryptDossier } from '../utils/dossier.util.js';
import ApiError from '../utils/ApiError.js';
import logger from '../config/logger.js';

const router = Router();

// A CIDv0 (Qm…) or a CIDv1 (bafy…/b…) in base32. Deliberately strict: this
// value is interpolated into a gateway URL, so nothing path-like gets through.
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,110})$/;

/**
 * GET /api/ipfs/:cid — read back a document BELTAL pinned (issue #48).
 *
 * Everything this project pins is AES-256-GCM encrypted first (identity
 * dossiers and asset specifications alike), so the raw gateway response is an
 * envelope, not readable content. This endpoint fetches it and decrypts it
 * with the server-held key, which is why it is restricted to ADMIN and
 * AUDITOR: a dossier holds PII and an asset spec holds classification tiers
 * and serial numbers. Anyone else reaching a CID on a public gateway directly
 * still gets nothing but ciphertext.
 */
router.get(
  '/:cid',
  authenticate,
  requireRole('ADMIN', 'AUDITOR'),
  async (req, res, next) => {
    try {
      const { cid } = req.params;
      if (!CID_PATTERN.test(cid)) {
        throw new ApiError(400, 'Not a valid IPFS CID');
      }

      const pinned = await ipfsService.fetchJson(cid);

      // Documents pinned before encryption was applied to asset specs are
      // plain JSON; they are returned as-is rather than failing the read.
      const isEnvelope =
        pinned && typeof pinned === 'object' && pinned.algo && pinned.iv && pinned.ciphertext;

      if (!isEnvelope) {
        return res.status(200).json({
          success: true,
          data: { cid, encrypted: false, content: pinned },
        });
      }

      let content;
      try {
        content = decryptDossier(pinned);
      } catch (err) {
        // Wrong key, or an envelope this deployment did not write.
        logger.error(`Failed to decrypt IPFS content at ${cid}: ${err.message}`);
        throw new ApiError(422, 'Content could not be decrypted with this deployment key');
      }

      return res.status(200).json({
        success: true,
        data: { cid, encrypted: true, content },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
