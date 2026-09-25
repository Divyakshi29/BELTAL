import express from 'express';
import authenticate from '../middleware/auth.middleware.js';
import userController from '../controllers/user.controller.js';

const router = express.Router();

router.get('/me', authenticate, userController.getMe);
router.get('/transfer-recipients', authenticate, userController.listTransferRecipients);

export default router;
