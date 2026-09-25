// Logic tests for identity revocation and the Anti-Tamper Lab.
//
// Run with: npm test (node --test). No database, chain or IPFS is needed:
// Prisma and the chain service are replaced with in-memory fakes, and the
// tests assert on the calls the services make and the state they leave behind.
// Prisma model delegates are swapped on the shared client, so this file must
// not be imported by application code.

import test from 'node:test';
import assert from 'node:assert/strict';

const load = (p) => import(`../src/${p}`);

const { default: prisma } = await load('config/db.js');
const { default: chainService } = await load('services/chain.service.js');
const { default: identityService } = await load('services/identity.service.js');
const { default: tamperService } = await load('services/tamper.service.js');
const { default: config } = await load('config/env.js');
const { encryptDossier, computeIdentityHash } = await load('utils/dossier.util.js');

// ---- fakes ---------------------------------------------------------------
let users = [];
let assets = [];
const calls = [];
function installFakePrisma() {
  const match = (row, where = {}) => {
    if (where.OR) return where.OR.some((w) => match(row, w));
    return Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
      return row[k] === v;
    });
  };
  const model = (rows) => ({
    findUnique: async ({ where }) => { const r = rows().find((x) => match(x, where)); return r ? { ...r } : null; },
    findFirst: async ({ where }) => { const r = rows().find((x) => match(x, where)); return r ? { ...r } : null; },
    count: async ({ where }) => rows().filter((r) => match(r, where)).length,
    update: async ({ where, data }) => {
      const row = rows().find((r) => match(r, where));
      Object.assign(row, data);
      return { ...row };
    },
  });
  Object.defineProperty(prisma, 'user', { value: model(() => users), configurable: true });
  Object.defineProperty(prisma, 'asset', { value: model(() => assets), configurable: true });
}
installFakePrisma();

const chain = { revoke: {}, role: {}, register: {}, grant: {}, assignRole: {}, identity: {}, asset: {} };
chainService.revokeIdentityOnChain = async (a) => { calls.push(['revokeIdentity', a.walletAddress]); return chain.revoke; };
chainService.revokeRoleOnChain = async (a) => { calls.push(['revokeRole', a.role]); return chain.role; };
chainService.registerIdentityOnChain = async (a) => { calls.push(['register', a.walletAddress]); return chain.register; };
chainService.grantRoleOnChain = async (a) => { calls.push(['grant', a.role]); return chain.grant; };
chainService.assignRoleOnChain = async (a) => { calls.push(['assignRole', a.role]); return chain.assignRole; };
chainService.verifyIdentityOnChain = async () => chain.identity;
chainService.getAssetOnChain = async () => chain.asset;

const mkUser = (o = {}) => ({
  id: 'u1', walletAddress: '0xAAA', externalId: 'E1', displayName: 'Asha', did: 'did:beltal:E1',
  role: 'MANAGER', clearanceLevel: 2, sbu: 'SBU_RADAR', identityHash: '0xhash', identitySalt: 's',
  dossierCid: null, revokedAt: null, revocationReason: null, revokeTxHash: null, ...o,
});
const ok = { txHash: '0xtx', blockNumber: 1, confirmed: true };
const reset = () => { calls.length = 0; users = [mkUser(), mkUser({ id: 'admin1', role: 'ADMIN', walletAddress: '0xADM', externalId: 'A1' })]; };

// ---- revoke --------------------------------------------------------------
test('revoke: chain identity first, then role, then DB stamp', async () => {
  reset();
  chain.revoke = ok; chain.role = { ...ok, txHash: '0xrole' };
  const { user, chain: c } = await identityService.revokeIdentity({ id: 'admin1', walletAddress: '0xADM' }, 'u1', 'Left the unit');
  assert.deepEqual(calls, [['revokeIdentity', '0xAAA'], ['revokeRole', 'MANAGER']]);
  assert.ok(user.revokedAt instanceof Date);
  assert.equal(user.revocationReason, 'Left the unit');
  assert.equal(user.revokeTxHash, '0xtx');
  assert.equal(c.roleRevoked, true);
});

test('revoke: cannot revoke yourself', async () => {
  reset();
  await assert.rejects(identityService.revokeIdentity({ id: 'u1' }, 'u1', 'x y z'), (e) => e.statusCode === 403 || e.status === 403);
  assert.equal(calls.length, 0);
});

test('revoke: already revoked is a 409 and touches nothing on-chain', async () => {
  reset(); users[0].revokedAt = new Date();
  await assert.rejects(identityService.revokeIdentity({ id: 'admin1' }, 'u1', 'again'), (e) => (e.statusCode ?? e.status) === 409);
  assert.equal(calls.length, 0);
});

test('revoke: last active admin is protected, a second admin is not', async () => {
  reset();
  await assert.rejects(identityService.revokeIdentity({ id: 'u1' }, 'admin1', 'nope'), (e) => (e.statusCode ?? e.status) === 409);
  users.push(mkUser({ id: 'admin2', role: 'ADMIN', walletAddress: '0xAD2', externalId: 'A2' }));
  chain.revoke = ok; chain.role = ok;
  const { user } = await identityService.revokeIdentity({ id: 'u1' }, 'admin1', 'rotation');
  assert.ok(user.revokedAt);
});

test('revoke: chain failure leaves the DB untouched', async () => {
  reset();
  chain.revoke = { confirmed: false, error: 'rpc down' };
  await assert.rejects(identityService.revokeIdentity({ id: 'admin1' }, 'u1', 'x y z'), (e) => (e.statusCode ?? e.status) === 502);
  assert.equal(users[0].revokedAt, null);
});

test('revoke: retry after a half-finished attempt ("not active" revert) completes the DB stamp', async () => {
  reset();
  chain.revoke = { confirmed: false, error: 'execution reverted: IdentityRegistry: Identity not active' };
  chain.role = ok;
  const { user, chain: c } = await identityService.revokeIdentity({ id: 'admin1' }, 'u1', 'retry');
  assert.ok(user.revokedAt);
  assert.equal(c.confirmed, true);
});

test('revoke: role-revoke failure is a warning, not a failure', async () => {
  reset();
  chain.revoke = ok; chain.role = { confirmed: false, error: 'gas' };
  const { user, chain: c } = await identityService.revokeIdentity({ id: 'admin1' }, 'u1', 'x y z');
  assert.ok(user.revokedAt);
  assert.equal(c.roleRevoked, false);
  assert.match(c.warning, /may still hold/);
});

test('updateRole refuses a revoked identity', async () => {
  reset(); users[0].revokedAt = new Date();
  await assert.rejects(identityService.updateRole('u1', { role: 'USER' }), (e) => (e.statusCode ?? e.status) === 409);
});

test('updateRole: "Identity not active" on a non-revoked user gets the never-registered-on-chain message, not a generic one', async () => {
  reset();
  chain.assignRole = { confirmed: false, error: 'execution reverted: IdentityRegistry: Identity not active' };
  const { user, chain: c } = await identityService.updateRole('u1', { role: 'AUDITOR' });
  assert.equal(user.role, 'AUDITOR'); // still applied off-chain
  assert.match(c.warning, /never fully registered on-chain/);
});

// ---- reinstate -----------------------------------------------------------
test('reinstate: re-registers, re-grants role, clears the stamp', async () => {
  reset(); users[0].revokedAt = new Date(); users[0].revocationReason = 'x';
  chain.register = ok; chain.grant = { ...ok, txHash: '0xg' };
  const { user, chain: c } = await identityService.reinstateIdentity({ id: 'admin1' }, 'u1');
  assert.deepEqual(calls, [['register', '0xAAA'], ['grant', 'MANAGER']]);
  assert.equal(user.revokedAt, null);
  assert.equal(user.revocationReason, null);
  assert.equal(c.roleGranted, true);
});

test('reinstate: also repairs a non-revoked identity that was never confirmed on-chain (no 409 — this is the fix for that state, not an error)', async () => {
  reset();
  chain.register = ok; chain.grant = { ...ok, txHash: '0xg' };
  const { user, chain: c } = await identityService.reinstateIdentity({ id: 'admin1' }, 'u1');
  assert.deepEqual(calls, [['register', '0xAAA'], ['grant', 'MANAGER']]);
  assert.equal(user.revokedAt, null);
  assert.equal(c.roleGranted, true);
});

test('reinstate: re-registering an already-active identity is a harmless no-op', async () => {
  reset();
  chain.register = { confirmed: false, error: 'execution reverted: IdentityRegistry: Identity already registered' };
  chain.grant = ok;
  const { user, chain: c } = await identityService.reinstateIdentity({ id: 'admin1' }, 'u1');
  assert.equal(user.revokedAt, null);
  assert.equal(c.confirmed, true);
});

// ---- anti-tamper: identity ----------------------------------------------
const salt = 'salt1';
function withDossier(sbu = 'SBU_RADAR') {
  const dossier = { externalId: 'E1', fullName: 'Asha Rao', sbu };
  const hash = computeIdentityHash({ externalId: 'E1', fullName: 'Asha Rao', sbu: 'SBU_RADAR', salt });
  const raw = encryptDossier(dossier);
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => raw });
  return { hash };
}
const onChainOk = (o = {}) => ({ verified: true, isActive: true, clearanceLevel: 2, sbuCode: 'SBU_RADAR', ...o });
const statusOf = (r, check) => r.verifications.find((v) => v.check === check)?.status;

test('identity check: everything consistent -> INTEGRITY_OK', async () => {
  reset();
  const { hash } = withDossier();
  Object.assign(users[0], { identityHash: hash, identitySalt: salt, dossierCid: 'Qm1' });
  chain.identity = onChainOk();
  const r = await tamperService.verifyIdentityIntegrity('E1');
  assert.equal(r.verdict, 'INTEGRITY_OK', JSON.stringify(r.verifications));
  assert.equal(statusOf(r, 'CLEARANCE_INTEGRITY'), 'CLEARANCE_MATCH');
});

test('identity check: forged clearance in the DB -> COMPROMISED with CLEARANCE_DRIFT', async () => {
  reset();
  const { hash } = withDossier();
  Object.assign(users[0], { identityHash: hash, identitySalt: salt, dossierCid: 'Qm1', clearanceLevel: 4 });
  chain.identity = onChainOk({ clearanceLevel: 2 });
  const r = await tamperService.verifyIdentityIntegrity('E1');
  assert.equal(r.verdict, 'INTEGRITY_COMPROMISED');
  assert.equal(statusOf(r, 'CLEARANCE_INTEGRITY'), 'CLEARANCE_DRIFT');
  const row = r.verifications.find((v) => v.check === 'CLEARANCE_INTEGRITY');
  assert.equal(row.dbValue, 4); assert.equal(row.onChainValue, 2);
});

test('identity check: forged clearance is caught even when IPFS is down', async () => {
  reset();
  globalThis.fetch = async () => { throw new Error('gateway timeout'); };
  Object.assign(users[0], { dossierCid: 'Qm1', clearanceLevel: 4 });
  chain.identity = onChainOk({ clearanceLevel: 2 });
  const r = await tamperService.verifyIdentityIntegrity('E1');
  assert.equal(r.verdict, 'INTEGRITY_COMPROMISED');
  assert.equal(statusOf(r, 'IPFS_DOSSIER_FETCH'), 'FETCH_ERROR');
});

test('identity check: IPFS down but nothing forged -> VERIFICATION_ERROR (not a false alarm)', async () => {
  reset();
  globalThis.fetch = async () => { throw new Error('gateway timeout'); };
  Object.assign(users[0], { dossierCid: 'Qm1' });
  chain.identity = onChainOk();
  const r = await tamperService.verifyIdentityIntegrity('E1');
  assert.equal(r.verdict, 'VERIFICATION_ERROR');
});

test('identity check: a properly revoked identity is consistent, not a hash-drift false alarm', async () => {
  reset();
  Object.assign(users[0], { dossierCid: null, revokedAt: new Date() });
  chain.identity = { verified: false, isActive: false, clearanceLevel: 2, sbuCode: 'SBU_RADAR' };
  const r = await tamperService.verifyIdentityIntegrity('E1');
  assert.equal(statusOf(r, 'ON_CHAIN_STATUS'), 'STATUS_MATCH');
  assert.equal(statusOf(r, 'ON_CHAIN_IDENTITY_REGISTRY'), undefined);
  assert.notEqual(r.verdict, 'INTEGRITY_COMPROMISED');
});

test('identity check: revoked on-chain but active in the DB -> STATUS_DRIFT', async () => {
  reset();
  Object.assign(users[0], { dossierCid: null });
  chain.identity = { verified: false, isActive: false, clearanceLevel: 2, sbuCode: 'SBU_RADAR' };
  const r = await tamperService.verifyIdentityIntegrity('E1');
  assert.equal(r.verdict, 'INTEGRITY_COMPROMISED');
  assert.equal(statusOf(r, 'ON_CHAIN_STATUS'), 'STATUS_DRIFT');
});

test('identity check: chain unreadable -> SKIPPED, never compromised', async () => {
  reset();
  chain.identity = { verified: false, error: 'rpc down' };
  const r = await tamperService.verifyIdentityIntegrity('E1');
  assert.equal(statusOf(r, 'ON_CHAIN_IDENTITY_REGISTRY'), 'SKIPPED');
  assert.notEqual(r.verdict, 'INTEGRITY_COMPROMISED');
});

// ---- simulate / restore --------------------------------------------------
test('simulate: forges clearance in the DB only; restore copies the chain value back', async () => {
  reset(); config.tamperSimulationEnabled = true;
  chain.identity = onChainOk({ clearanceLevel: 2 });
  const sim = await tamperService.simulateTamper({ kind: 'identity', id: 'E1' }, { id: 'admin1' });
  assert.deepEqual([sim.before, sim.after, sim.field], [2, 4, 'clearanceLevel']);
  assert.equal(users[0].clearanceLevel, 4);
  const rest = await tamperService.restoreFromChain({ kind: 'identity', id: 'E1' }, { id: 'admin1' });
  assert.deepEqual([rest.before, rest.after], [4, 2]);
  assert.equal(users[0].clearanceLevel, 2);
  assert.equal(calls.length, 0, 'simulation must never send a chain transaction');
});

test('simulate: tier 4 flips down so the change is always a real difference', async () => {
  reset(); config.tamperSimulationEnabled = true; users[0].clearanceLevel = 4;
  const sim = await tamperService.simulateTamper({ kind: 'identity', id: 'u1' }, {});
  assert.equal(sim.after, 1);
});

test('simulate/restore: asset classification tier', async () => {
  reset(); config.tamperSimulationEnabled = true;
  assets = [{ id: 'a1', tokenId: '7', name: 'SDR', classificationTier: 3 }];
  chain.asset = { found: true, classificationTier: 3n };
  const sim = await tamperService.simulateTamper({ kind: 'asset', id: '7' }, {});
  assert.equal(assets[0].classificationTier, 4); assert.equal(sim.before, 3);
  const rest = await tamperService.restoreFromChain({ kind: 'asset', id: 'a1' }, {});
  assert.equal(assets[0].classificationTier, 3); assert.equal(rest.after, 3);
});

test('simulate/restore: disabled flag -> 403', async () => {
  reset(); config.tamperSimulationEnabled = false;
  await assert.rejects(tamperService.simulateTamper({ kind: 'identity', id: 'E1' }, {}), (e) => (e.statusCode ?? e.status) === 403);
  await assert.rejects(tamperService.restoreFromChain({ kind: 'identity', id: 'E1' }, {}), (e) => (e.statusCode ?? e.status) === 403);
  config.tamperSimulationEnabled = true;
});

test('restore: refuses to guess when the chain cannot be read, or the identity is revoked', async () => {
  reset(); config.tamperSimulationEnabled = true; users[0].clearanceLevel = 4;
  chain.identity = { verified: false, error: 'rpc down' };
  await assert.rejects(tamperService.restoreFromChain({ kind: 'identity', id: 'E1' }, {}), (e) => (e.statusCode ?? e.status) === 502);
  chain.identity = { verified: false, isActive: false, clearanceLevel: 2, sbuCode: 'SBU_RADAR' };
  await assert.rejects(tamperService.restoreFromChain({ kind: 'identity', id: 'E1' }, {}), (e) => (e.statusCode ?? e.status) === 409);
  assert.equal(users[0].clearanceLevel, 4);
});
