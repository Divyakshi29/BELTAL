import { z } from 'zod';
import { SBU_VALUES } from './admin.validator.js';

const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;

export const nonceSchema = z.object({
  walletAddress: z
    .string({ required_error: 'walletAddress is required' })
    .trim()
    .regex(ethAddressRegex, 'Invalid Ethereum wallet address format (must be 0x followed by 40 hex characters)'),
});

export const verifySchema = z.object({
  walletAddress: z
    .string({ required_error: 'walletAddress is required' })
    .trim()
    .regex(ethAddressRegex, 'Invalid Ethereum wallet address format (must be 0x followed by 40 hex characters)'),
  signature: z
    .string({ required_error: 'signature is required' })
    .trim()
    .min(10, 'Signature is too short or malformed')
    .refine((sig) => sig.startsWith('0x'), {
      message: 'Signature must start with 0x prefix',
    }),
});

// Deliberately has no role field: a self-registering wallet can never pick its own role.
export const registerSchema = z.object({
  fullName: z.string({ error: 'fullName is required' }).trim().min(2, 'fullName is required').max(120),
  externalId: z.string({ error: 'externalId (employee ID) is required' }).trim().min(1, 'externalId (employee ID) is required').max(64),
  requestedSbu: z.enum(SBU_VALUES, { error: 'requestedSbu must be a valid SBU' }),
  note: z.string().trim().max(500).optional(),
});
