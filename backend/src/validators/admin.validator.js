import { z } from 'zod';

const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
const ROLE_VALUES = ['ADMIN', 'MANAGER', 'AUDITOR', 'USER', 'SYSTEM_CONNECTOR'];
export const SBU_VALUES = ['SBU_RADAR', 'SBU_EW', 'SBU_MILCOMM', 'SBU_CYBER'];

export const registerIdentitySchema = z.object({
  walletAddress: z
    .string({ required_error: 'walletAddress is required' })
    .trim()
    .regex(ethAddressRegex, 'Invalid Ethereum wallet address format (must be 0x followed by 40 hex characters)'),
  externalId: z.string({ required_error: 'externalId (employee code) is required' }).trim().min(1),
  fullName: z.string({ required_error: 'fullName is required' }).trim().min(1),
  displayName: z.string().trim().min(1).optional(),
  role: z.enum(ROLE_VALUES).optional(),
  clearanceLevel: z
    .number({ required_error: 'clearanceLevel is required' })
    .int()
    .min(1)
    .max(4),
  sbu: z.enum(SBU_VALUES, { required_error: 'sbu is required' }),
  piiDossier: z.record(z.string(), z.any()).optional(),
});

export const updateRoleSchema = z
  .object({
    role: z.enum(ROLE_VALUES).optional(),
    clearanceLevel: z.number().int().min(1).max(4).optional(),
  })
  .refine((data) => data.role !== undefined || data.clearanceLevel !== undefined, {
    message: 'At least one of role or clearanceLevel must be provided',
  });

// managerId: null explicitly clears the assignment; omitted leaves it as-is.
// seniorityGrade 1-9 approximates BEL's E1 (Engineer) .. E9 (Executive
// Director) executive ladder — organizational rank, independent of
// clearanceLevel (security classification access).
export const updateOrgAssignmentSchema = z
  .object({
    managerId: z.string().uuid('managerId must be a valid identity id').nullable().optional(),
    seniorityGrade: z.number().int().min(1).max(9).nullable().optional(),
  })
  .refine((data) => data.managerId !== undefined || data.seniorityGrade !== undefined, {
    message: 'At least one of managerId or seniorityGrade must be provided',
  });

// Empty query params (e.g. `?sbu=`) mean "no filter".
const emptyToUndefined = (value) => (value === '' ? undefined : value);

export const listIdentitiesQuerySchema = z.object({
  search: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  sbu: z.preprocess(emptyToUndefined, z.enum(SBU_VALUES).optional()),
  clearance: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(4).optional()),
  // ACTIVE = not revoked, REVOKED = quarantined; omitted = both.
  status: z.preprocess(emptyToUndefined, z.enum(['ACTIVE', 'REVOKED']).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(20)),
});

// The reason is written on-chain and shown to auditors, so it is mandatory.
export const revokeIdentitySchema = z.object({
  reason: z
    .string({ error: 'reason is required' })
    .trim()
    .min(3, 'Give a reason of at least 3 characters')
    .max(200, 'reason must be at most 200 characters'),
});

export const listRegistrationsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

// SYSTEM_CONNECTOR is machine-only and provisioned via POST /identities, never
// through self-registration approval.
export const approveRegistrationSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'AUDITOR', 'USER'], { error: 'role is required' }),
  clearanceLevel: z.number({ error: 'clearanceLevel is required' }).int().min(1).max(4),
  sbu: z.enum(SBU_VALUES).optional(),
});

export const rejectRegistrationSchema = z.object({
  reason: z.string({ error: 'reason is required' }).trim().min(1, 'reason is required').max(500),
});

// Facility zone create/update (full replace, keyed by zoneId). zoneId must fit
// a bytes32 on-chain (31 bytes ASCII). An omitted/null sbu means "any SBU".
export const upsertZoneSchema = z.object({
  zoneId: z
    .string({ error: 'zoneId is required' })
    .trim()
    .min(1, 'zoneId is required')
    .max(31, 'zoneId must be at most 31 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'zoneId may only contain letters, digits, underscores and hyphens'),
  name: z.string({ error: 'name is required' }).trim().min(1, 'name is required').max(120),
  sbu: z.enum(SBU_VALUES).nullish(),
  requiredClearance: z
    .number({ error: 'requiredClearance is required' })
    .int()
    .min(1)
    .max(4),
});
