import { z } from 'zod';

export const badgeEventSchema = z.object({
  readerId: z.string({ required_error: 'readerId is required' }).trim().min(1),
  zoneId: z.string({ required_error: 'zoneId is required' }).trim().min(1),
  // Employee code (User.externalId), not the internal UUID — this is what a
  // physical badge encodes/what HRMS/PACS systems key on.
  employeeId: z.string({ required_error: 'employeeId is required' }).trim().min(1),
});

export const lockdownSchema = z.object({
  locked: z.boolean({ required_error: 'locked is required' }),
});

// DEMO simulator tap: the human-facing counterpart of badgeEventSchema. The
// employee is picked from a directory, so it is identified by internal User id
// or wallet address rather than the badge's employee code.
export const simulateTapSchema = z
  .object({
    zoneId: z.string({ required_error: 'zoneId is required' }).trim().min(1),
    employeeId: z.string().trim().min(1).optional(),
    walletAddress: z.string().trim().min(1).optional(),
    readerId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((body) => Boolean(body.employeeId) !== Boolean(body.walletAddress), {
    message: 'Provide exactly one of employeeId or walletAddress',
    path: ['employeeId'],
  });

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  zoneId: z.string().trim().min(1).optional(),
  decision: z.enum(['GRANTED', 'DENIED']).optional(),
});

export default { badgeEventSchema, lockdownSchema, simulateTapSchema, listEventsQuerySchema };
