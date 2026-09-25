import { z } from 'zod';

const uuid = z.string().trim().uuid('must be a valid identity id');

export const addGuardianSchema = z.object({
  guardianId: uuid,
});

export const requestRecoverySchema = z.object({
  userId: uuid,
  newWalletAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'must be a valid Ethereum wallet address'),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain why recovery is needed (at least 10 characters)')
    .max(500),
});

export const rejectRecoverySchema = z.object({
  rejectionReason: z.string().trim().min(3, 'Give a reason for the rejection').max(500),
});

export const listRecoveryQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED']).optional(),
});

export default {
  addGuardianSchema,
  requestRecoverySchema,
  rejectRecoverySchema,
  listRecoveryQuerySchema,
};
