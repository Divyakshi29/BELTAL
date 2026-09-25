import { z } from 'zod';

const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
const STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED'];

export const createTransferRequestSchema = z
  .object({
    assetId: z.string({ required_error: 'assetId is required' }).trim().min(1),
    toUserId: z.string().trim().min(1).optional(),
    toWalletAddress: z.string().trim().regex(ethAddressRegex, 'Invalid Ethereum wallet address format').optional(),
    reason: z.string().trim().optional(),
  })
  .refine((data) => data.toUserId !== undefined || data.toWalletAddress !== undefined, {
    message: 'Either toUserId or toWalletAddress must be provided',
  });

export const listTransfersQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  type: z.enum(['all', 'incoming', 'outgoing', 'pending']).optional().default('all'),
  assetId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const rejectTransferSchema = z.object({
  reason: z.string().trim().optional(),
});

export default { createTransferRequestSchema, listTransfersQuerySchema, rejectTransferSchema };
