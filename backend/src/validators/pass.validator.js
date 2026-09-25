import { z } from 'zod';

const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
const SBU_VALUES = ['SBU_RADAR', 'SBU_EW', 'SBU_MILCOMM', 'SBU_CYBER'];

export const createCrossSbuPassSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    walletAddress: z.string().trim().regex(ethAddressRegex, 'Invalid Ethereum wallet address format').optional(),
    targetSbu: z.enum(SBU_VALUES, { required_error: 'targetSbu is required' }),
    durationHours: z.coerce.number().positive().optional(),
    validUntil: z.string().datetime().optional(),
    reason: z.string().trim().optional(),
  })
  .refine((data) => data.userId !== undefined || data.walletAddress !== undefined, {
    message: 'Either userId or walletAddress must be provided',
  });

export default { createCrossSbuPassSchema };
