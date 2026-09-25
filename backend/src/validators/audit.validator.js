import { z } from 'zod';

const AUDIT_TYPES = [
  'IDENTITY_CREATED',
  'ROLE_ASSIGNED',
  'ASSET_MINTED',
  'TRANSFER_REQUESTED',
  'TRANSFER_REJECTED',
  'OWNERSHIP_TRANSFERRED',
  'PACS_ACCESS_GRANTED',
  'PACS_ACCESS_DENIED',
];

// The auditor UI filters by friendlier action names; map them onto the stored
// event types so both spellings work.
const TYPE_ALIASES = {
  ROLE_CHANGED: 'ROLE_ASSIGNED',
  TRANSFER_EXECUTED: 'OWNERSHIP_TRANSFERRED',
  BADGE_TAP: 'PACS_ACCESS_GRANTED,PACS_ACCESS_DENIED',
};

const isValidDate = (value) => !value || !Number.isNaN(Date.parse(value));
const optionalText = z.string().trim().optional();
const optionalDate = z.string().trim().refine(isValidDate, 'must be a valid date').optional();

const resolveTypes = (raw) =>
  (raw || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => TYPE_ALIASES[t] || t)
    .join(',');

const baseFilterSchema = z.object({
  type: optionalText,
  actionType: optionalText,
  actorId: optionalText,
  actor: optionalText,
  targetId: optionalText,
  asset: optionalText,
  txHash: optionalText,
  from: optionalDate,
  startDate: optionalDate,
  to: optionalDate,
  endDate: optionalDate,
});

// Collapses the alias params into the canonical names the audit service reads.
const normalizeFilters = (q) => ({
  type: resolveTypes(q.type || q.actionType) || undefined,
  actorId: q.actorId || q.actor || undefined,
  targetId: q.targetId || q.asset || undefined,
  txHash: q.txHash || undefined,
  from: q.from || q.startDate || undefined,
  to: q.to || q.endDate || undefined,
});

const typesAreValid = (q) => {
  const types = resolveTypes(q.type || q.actionType);
  return !types || types.split(',').every((t) => AUDIT_TYPES.includes(t));
};

export const auditQuerySchema = baseFilterSchema
  .extend({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(typesAreValid, { message: `type must be one of: ${AUDIT_TYPES.join(', ')}`, path: ['type'] })
  .transform((q) => ({ ...normalizeFilters(q), page: q.page, limit: q.limit }));

export const auditStatsQuerySchema = baseFilterSchema.transform((q) => {
  const { from, to } = normalizeFilters(q);
  return { from, to };
});

export default { auditQuerySchema, auditStatsQuerySchema };
