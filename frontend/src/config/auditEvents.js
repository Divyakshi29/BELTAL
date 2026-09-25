// Audit event types as emitted by the backend (AuditEventType enum plus the
// PACS badge decisions merged into the trail), with the presentation shared by
// the auditor views.
export const AUDIT_EVENT_TYPES = [
  { value: 'IDENTITY_CREATED', label: 'Identity Created', icon: 'person_add', color: 'text-emerald-400' },
  { value: 'ROLE_ASSIGNED', label: 'Role Assigned', icon: 'admin_panel_settings', color: 'text-blue-400' },
  { value: 'ASSET_MINTED', label: 'Asset Minted', icon: 'token', color: 'text-amber-400' },
  { value: 'TRANSFER_REQUESTED', label: 'Transfer Requested', icon: 'swap_horiz', color: 'text-orange-400' },
  { value: 'TRANSFER_REJECTED', label: 'Transfer Rejected', icon: 'block', color: 'text-red-400' },
  { value: 'OWNERSHIP_TRANSFERRED', label: 'Ownership Transferred', icon: 'swap_horiz', color: 'text-purple-400' },
  { value: 'PACS_ACCESS_GRANTED', label: 'Badge Access Granted', icon: 'badge', color: 'text-pink-400' },
  { value: 'PACS_ACCESS_DENIED', label: 'Badge Access Denied', icon: 'badge', color: 'text-red-400' },
];

export const getActionIcon = (actionType) =>
  AUDIT_EVENT_TYPES.find((t) => t.value === actionType)?.icon || 'event';

export const getActionColor = (actionType) =>
  AUDIT_EVENT_TYPES.find((t) => t.value === actionType)?.color || 'text-slate-400';

// Only a real 32-byte transaction hash can be checked against the chain; the
// backend stores placeholder hashes for events recorded off-chain.
export const isChainTxHash = (hash) => /^0x[0-9a-fA-F]{64}$/.test(hash || '');

export const formatAuditDate = (dateString, { seconds = false } = {}) =>
  new Date(dateString).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  });
