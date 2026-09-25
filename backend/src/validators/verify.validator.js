import { z } from 'zod';

// Target of an Anti-Tamper Lab demo action: one identity (by UUID or employee
// code) or one asset (by UUID or on-chain token id).
export const tamperTargetSchema = z.object({
  kind: z.enum(['identity', 'asset'], { error: "kind must be 'identity' or 'asset'" }),
  id: z.string({ error: 'id is required' }).trim().min(1, 'id is required').max(100),
});

export default { tamperTargetSchema };
