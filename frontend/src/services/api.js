import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || localStorage.getItem('trustchain_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      localStorage.removeItem('trustchain_token');
      localStorage.removeItem('trustchain_user');
      window.dispatchEvent(new CustomEvent('beltal:session-expired'));
    }
    const data = error.response?.data;
    return Promise.reject({ ...error, uiMessage: data?.message || data?.error?.message || data?.error || error.message || 'An unexpected error occurred' });
  }
);

// Anything that waits on a Sepolia transaction (about 12s per block, and some
// calls send two) needs far longer than the default read timeout.
const CHAIN_TX_TIMEOUT = 90_000;

export const get = (url, config) => api.get(url, config);
export const post = (url, data, config) => api.post(url, data, config);
export const put = (url, data, config) => api.put(url, data, config);
export const patch = (url, data, config) => api.patch(url, data, config);
export const del = (url, config) => api.delete(url, config);

export const authApi = {
  getNonce: (walletAddress) => api.post('/auth/nonce', { walletAddress }).then((r) => r.data.data),
  verify: (walletAddress, signature) => api.post('/auth/verify', { walletAddress, signature }).then((r) => r.data.data),
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data.data),
  registrationStatus: () => api.get('/auth/registration-status').then((r) => r.data.data),
};
export const adminApi = {
  getStats: () => api.get('/admin/stats').then((r) => r.data.data),
  listIdentities: (params = {}) => api.get('/admin/identities', { params }).then((r) => r.data.data),
  registerIdentity: (payload) => api.post('/admin/identities', payload, { timeout: CHAIN_TX_TIMEOUT }).then((r) => r.data.data),
  // Up to 3 sequential on-chain confirmations (updateClearance, grantRole,
  // and — if the role actually changed — revokeRole on the old one), so a
  // caller expecting all three (e.g. a repair retry after reinstate) should
  // pass a longer `timeout` override.
  updateRole: (id, payload, { timeout = CHAIN_TX_TIMEOUT } = {}) =>
    api.patch(`/admin/identities/${id}/role`, payload, { timeout }).then((r) => r.data.data),
  updateOrgAssignment: (id, payload) => api.patch(`/admin/identities/${id}/manager`, payload).then((r) => r.data.data),
  listRegistrations: (params = {}) => api.get('/admin/registrations', { params }).then((r) => r.data.data),
  approveRegistration: (id, payload) => api.post(`/admin/registrations/${id}/approve`, payload, { timeout: CHAIN_TX_TIMEOUT }).then((r) => r.data.data),
  rejectRegistration: (id, reason) => api.post(`/admin/registrations/${id}/reject`, { reason }).then((r) => r.data.data),
  // Revoking is two on-chain transactions (identity, then role), so allow for
  // Sepolia block times.
  revokeIdentity: (id, reason) =>
    api.post(`/admin/identities/${id}/revoke`, { reason }, { timeout: CHAIN_TX_TIMEOUT }).then((r) => r.data.data),
  // Two sequential on-chain confirmations (register, then grant).
  reinstateIdentity: (id, { timeout = CHAIN_TX_TIMEOUT } = {}) =>
    api.post(`/admin/identities/${id}/reinstate`, undefined, { timeout }).then((r) => r.data.data),
  listZones: () => api.get('/admin/zones').then((r) => r.data.data?.zones || []),
  upsertZone: (payload) => api.post('/admin/zones', payload, { timeout: CHAIN_TX_TIMEOUT }).then((r) => r.data.data),
};

// Cross-SBU access passes: time-boxed visibility into another business unit.
export const passApi = {
  grant: (payload) => api.post('/passes/cross-sbu', payload).then((r) => r.data.data),
  active: (userId) => api.get(`/passes/cross-sbu/active/${encodeURIComponent(userId)}`).then((r) => r.data.data || []),
};

// Guardian-based account recovery. Executing a recovery is a revoke plus a
// re-register on-chain, so it gets the long timeout.
export const recoveryApi = {
  list: (params = {}) => api.get('/recovery', { params }).then((r) => r.data.data || []),
  get: (id) => api.get(`/recovery/${encodeURIComponent(id)}`).then((r) => r.data.data),
  request: (payload) => api.post('/recovery', payload).then((r) => r.data.data),
  approve: (id) => api.post(`/recovery/${encodeURIComponent(id)}/approve`).then((r) => r.data.data),
  reject: (id, rejectionReason) =>
    api.post(`/recovery/${encodeURIComponent(id)}/reject`, { rejectionReason }).then((r) => r.data.data),
  execute: (id) =>
    api.post(`/recovery/${encodeURIComponent(id)}/execute`, undefined, { timeout: CHAIN_TX_TIMEOUT }).then((r) => r.data.data),
  // Backend returns { guardians, threshold }; this UI only ever wants the array.
  listGuardians: (userId) => api.get(`/recovery/guardians/${encodeURIComponent(userId)}`).then((r) => r.data.data?.guardians || []),
  addGuardian: (userId, guardianId) =>
    api.post(`/recovery/guardians/${encodeURIComponent(userId)}`, { guardianId }).then((r) => r.data.data),
  removeGuardian: (userId, guardianId) =>
    api.delete(`/recovery/guardians/${encodeURIComponent(userId)}/${encodeURIComponent(guardianId)}`).then((r) => r.data.data),
};
export const assetApi = {
  mint: (payload) => api.post('/assets', payload, { timeout: CHAIN_TX_TIMEOUT }).then((r) => r.data.data),
  list: (params = {}) => api.get('/assets', { params }).then((r) => r.data.data),
  listMine: () => api.get('/assets/me').then((r) => r.data.data),
  getById: (id) => api.get(`/assets/${encodeURIComponent(id)}`).then((r) => r.data.data),
};
export const userApi = {
  listTransferRecipients: (params = {}) => api.get('/users/transfer-recipients', { params }).then((r) => r.data.data),
  // Fuller identity view than the JWT carries — adds seniorityGrade/manager,
  // which are organizational metadata, not auth claims.
  getMe: () => api.get('/users/me').then((r) => r.data.data),
};
export const transferApi = {
  list: (params = {}) => api.get('/transfers', { params }).then((r) => r.data.data),
  create: (payload) => api.post('/transfers/request', payload).then((r) => r.data.data),
  approve: (id) => api.post(`/transfers/${id}/approve`, undefined, { timeout: CHAIN_TX_TIMEOUT }).then((r) => r.data.data),
  reject: (id, payload = {}) => api.post(`/transfers/${id}/reject`, payload).then((r) => r.data.data),
};
// The audit views filter on `actionType` / `actor` / `asset` / `startDate` /
// `endDate`; those are sent as the canonical `type` / `actorId` / `targetId` /
// `from` / `to`, with the end date widened to the end of that day. Each event
// also gets the aliases the audit views render from.
const toAuditParams = ({ actionType, startDate, endDate, actor, asset, ...rest } = {}) => {
  const params = { ...rest };
  if (actionType) params.type = actionType;
  if (actor) params.actorId = actor;
  if (asset) params.targetId = asset;
  if (startDate) params.from = new Date(`${startDate}T00:00:00`).toISOString();
  if (endDate) params.to = new Date(`${endDate}T23:59:59.999`).toISOString();
  return params;
};

const toAuditEvent = (event) => ({
  ...event,
  actionType: event.type,
  performedBy: event.actor,
  entityId: event.targetId,
  entityName: event.payload?.name ?? event.payload?.assetName ?? null,
});

export const auditApi = {
  list: (params = {}) =>
    api.get('/audit', { params: toAuditParams(params) }).then((r) => ({
      events: (r.data.data?.events || []).map(toAuditEvent),
      pagination: r.data.data?.pagination,
    })),
  getStats: ({ startDate, endDate } = {}) =>
    api.get('/audit/stats', { params: toAuditParams({ startDate, endDate }) }).then((r) => r.data.data),
  verify: (id) => api.get(`/audit/verify/${encodeURIComponent(id)}`).then((r) => r.data.data),
  // Single-event fetch, for a shareable "?event=<id>" deep link — the row may
  // not be on the caller's currently loaded/filtered page, so this can't
  // just reuse the list.
  getById: (id) => api.get(`/audit/${encodeURIComponent(id)}`).then((r) => toAuditEvent(r.data.data)),
  // Indexed records for one transaction hash, for cross-checking against the chain.
  findByTxHash: (txHash) =>
    api.get('/audit', { params: { txHash, limit: 10 } }).then((r) => (r.data.data?.events || []).map(toAuditEvent)),
};

/**
 * AI query assistant (issue #70). The answer is always returned with the audit
 * records it was grounded in, so the UI can show the evidence next to the
 * summary. A model round-trip with several tool calls is slow, so this gets a
 * far longer timeout than an ordinary read.
 */
const ASSISTANT_TIMEOUT = 120_000;
export const assistantApi = {
  status: () => api.get('/assistant/status').then((r) => r.data.data),
  query: (question) =>
    api
      .post('/assistant/query', { question }, { timeout: ASSISTANT_TIMEOUT })
      .then((r) => r.data.data),
};

// Independent verification against the chain. Unlike the other endpoints,
// /verify/* responds with a bare payload (no { success, data } envelope). The
// identity check re-fetches the IPFS dossier, so allow longer than the default.
const VERIFY_TIMEOUT = 45_000;
export const verifyApi = {
  tx: (txHash) =>
    api.get(`/verify/tx/${encodeURIComponent(txHash)}`, { timeout: VERIFY_TIMEOUT }).then((r) => r.data),
  asset: (id) =>
    api.get(`/verify/asset/${encodeURIComponent(id)}`, { timeout: VERIFY_TIMEOUT }).then((r) => r.data),
  identity: (id) =>
    api.get(`/verify/identity/${encodeURIComponent(id)}`, { timeout: VERIFY_TIMEOUT }).then((r) => r.data),
  // Demo tools for the Anti-Tamper Lab. These use the standard { success, data }
  // envelope. `kind` is 'identity' or 'asset'.
  simulateTamper: (kind, id) =>
    api.post('/verify/simulate-tamper', { kind, id }, { timeout: VERIFY_TIMEOUT }).then((r) => r.data.data),
  restoreFromChain: (kind, id) =>
    api.post('/verify/restore', { kind, id }, { timeout: VERIFY_TIMEOUT }).then((r) => r.data.data),
};

// PACS console. `simulateTap` is the demo counterpart of the machine-only
// badge-event ingest: it runs the same decision + logging path on behalf of a
// signed-in ADMIN/MANAGER. The tap awaits the on-chain canAccessZone() read, so
// allow longer than the default; the lockdown toggle awaits a chain tx.
const PACS_TIMEOUT = 45_000;
export const pacsApi = {
  listZones: () => api.get('/pacs/zones').then((r) => r.data.data?.zones || []),
  listEvents: (params = {}) =>
    api.get('/pacs/events', { params }).then((r) => ({
      events: r.data.data?.events || [],
      pagination: r.data.data?.pagination,
    })),
  simulateTap: (payload) =>
    api.post('/pacs/simulate-tap', payload, { timeout: PACS_TIMEOUT }).then((r) => r.data.data),
  setLockdown: (zoneId, locked) =>
    api
      .patch(`/pacs/zones/${encodeURIComponent(zoneId)}/lockdown`, { locked }, { timeout: PACS_TIMEOUT })
      .then((r) => r.data.data),
};

export default api;
