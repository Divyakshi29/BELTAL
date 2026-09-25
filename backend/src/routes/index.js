import express from 'express';
import authRoutes from './auth.route.js';
import userRoutes from './user.route.js';
import adminRoutes from './admin.route.js';
import assetRoutes from './asset.route.js';
import transferRoutes from './transfer.route.js';
import passRoutes from './pass.route.js';
import auditRoutes from './audit.route.js';
import verifyRoutes from './verify.route.js';
import pacsRoutes from './pacs.route.js';
import ipfsRoutes from './ipfs.route.js';
import assistantRoutes from './assistant.route.js';
import recoveryRoutes from './recovery.route.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth',      authRoutes);
router.use('/users',     userRoutes);
router.use('/admin',     adminRoutes);
router.use('/assets',    assetRoutes);
router.use('/transfers', transferRoutes);
router.use('/passes',    passRoutes);
router.use('/audit',     auditRoutes);
router.use('/verify',    verifyRoutes);
router.use('/pacs',      pacsRoutes);
router.use('/ipfs',      ipfsRoutes);
router.use('/assistant', assistantRoutes);
router.use('/recovery',  recoveryRoutes);

export default router;

