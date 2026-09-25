import { z } from 'zod';

const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
const SBU_VALUES = ['SBU_RADAR', 'SBU_EW', 'SBU_MILCOMM', 'SBU_CYBER'];

export const createAssetSchema = z.object({
  name: z.string({ required_error: 'Asset name is required' }).trim().min(1, 'Asset name cannot be empty'),
  classificationTier: z
    .number({ required_error: 'classificationTier is required' })
    .int('classificationTier must be an integer')
    .min(1, 'classificationTier must be between 1 and 4')
    .max(4, 'classificationTier must be between 1 and 4'),
  sbu: z.enum(SBU_VALUES, { required_error: 'sbu is required' }),
  ownerId: z.string().trim().min(1).optional(),
  ownerWalletAddress: z.string().trim().regex(ethAddressRegex, 'Invalid Ethereum wallet address format').optional(),
  tokenId: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const getAssetsQuerySchema = z.object({
  sbu: z.enum(SBU_VALUES).optional(),
  classificationTier: z.coerce.number().int().min(1).max(4).optional(),
  search: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default { createAssetSchema, getAssetsQuerySchema };
