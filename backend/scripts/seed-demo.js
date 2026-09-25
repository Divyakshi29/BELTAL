/**
 * seed-demo.js — Populate BELTAL with a complete, idempotent demo dataset
 * (issue #71): one identity per role, four SBUs, facility zones, assets across
 * classification tiers, a pending custody transfer, an active Cross-SBU pass and
 * a pending self-registration request.
 *
 * Run from the /backend directory:
 *
 *   npm run seed:demo -- --dry-run                 # print the plan, write nothing
 *   npm run seed:demo -- --offchain                # DB rows only (no chain, no IPFS)
 *   npm run seed:demo                              # on-chain: real services
 *   npm run seed:demo -- --admin 0xYourMetaMask    # use your own wallet for a role
 *
 * Modes
 *   --offchain   Writes Postgres rows only. No RPC, no Pinata, no testnet ETH.
 *                identityHash is computed for real; dossierCid and asset cid are
 *                clearly marked placeholders ("offchain-demo-..."), assets have
 *                no tokenId and audit rows carry "0xoffchain_demoseed_..." tx
 *                hashes. Good for local UI demos.
 *   --onchain    (default) Goes through identityService.registerIdentity, the
 *                asset mint flow and AccessControl.createZone: needs RPC_URL,
 *                the contract addresses, a FUNDED DEPLOYER_PRIVATE_KEY and
 *                Pinata credentials in .env. Preflight aborts before any write
 *                if one is missing. Audit rows for identities come from the
 *                event indexer (not created here).
 *   --dry-run    Combine with either mode. Reads the database (when reachable)
 *                to report what exists vs. what would be created, but writes
 *                nothing: no rows, no transactions, no pins, no wallet file.
 *
 * Wallets
 *   Roles: ADMIN, MANAGER (Radar), MANAGER2 (EW), AUDITOR, USER (Radar),
 *          USER2 (EW), APPLICANT (pending registration request).
 *   Per role the address is taken from, in order: the CLI flag
 *   (--admin, --manager, --manager2, --auditor, --user, --user2, --applicant),
 *   the env var (SEED_ADMIN_WALLET, SEED_MANAGER_WALLET, SEED_MANAGER2_WALLET,
 *   SEED_AUDITOR_WALLET, SEED_USER_WALLET, SEED_USER2_WALLET,
 *   SEED_APPLICANT_WALLET), an earlier entry in backend/.demo-wallets.json, and
 *   finally a freshly generated ethers wallet. Generated addresses AND private
 *   keys are saved to backend/.demo-wallets.json (gitignored) so re-runs reuse
 *   them; import the keys into MetaMask to sign in as each role. Private keys
 *   are only printed to the terminal with --print-keys.
 *
 * Idempotency
 *   Every record is looked up first (identities by employee ID / wallet, zones
 *   by zoneId, assets by name, the transfer by asset + PENDING status, the pass
 *   by user + SBU + marker, the request by wallet / employee ID) and skipped
 *   when present, so re-running is safe. The Cross-SBU pass is refreshed to
 *   stay valid for another 7 days. A registration request that was already
 *   approved/rejected during a rehearsal is left alone.
 *
 * NOTE: writes go to whatever DATABASE_URL points at; the target host is
 * printed first. Use --dry-run to check before pointing it at a shared database.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { ethers } from 'ethers';
import config from '../src/config/env.js';
import { buildDid, computeIdentityHash } from '../src/utils/dossier.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WALLETS_FILE = path.resolve(__dirname, '..', '.demo-wallets.json');

const PASS_MARKER = '[demo-seed]';
const PASS_VALID_DAYS = 7;

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export const IDENTITIES = [
  {
    key: 'ADMIN',
    role: 'ADMIN',
    fullName: 'Rajesh Kumar Sharma',
    externalId: 'BEL-ADM-0001',
    sbu: 'SBU_CYBER',
    clearanceLevel: 4,
    dossier: { designation: 'Chief Information Security Officer', department: 'Corporate IT Security' },
  },
  {
    key: 'MANAGER',
    role: 'MANAGER',
    fullName: 'Anita Deshpande',
    externalId: 'BEL-MGR-1001',
    sbu: 'SBU_RADAR',
    clearanceLevel: 4,
    dossier: { designation: 'Senior Manager, Radar Systems', department: 'Radar SBU' },
  },
  {
    key: 'MANAGER2',
    role: 'MANAGER',
    fullName: 'Vikram Singh Rathore',
    externalId: 'BEL-MGR-2001',
    sbu: 'SBU_EW',
    clearanceLevel: 3,
    dossier: { designation: 'Deputy General Manager, Electronic Warfare', department: 'EW SBU' },
  },
  {
    key: 'AUDITOR',
    role: 'AUDITOR',
    fullName: 'Meera Iyer',
    externalId: 'BEL-AUD-0001',
    sbu: 'SBU_CYBER',
    clearanceLevel: 3,
    dossier: { designation: 'Internal Security Auditor', department: 'Vigilance & Audit' },
  },
  {
    key: 'USER',
    role: 'USER',
    fullName: 'Suresh Nair',
    externalId: 'BEL-EMP-3001',
    sbu: 'SBU_RADAR',
    clearanceLevel: 2,
    dossier: { designation: 'Test Engineer, Radar Integration', department: 'Radar SBU' },
  },
  {
    key: 'USER2',
    role: 'USER',
    fullName: 'Priya Menon',
    externalId: 'BEL-EMP-3002',
    sbu: 'SBU_EW',
    clearanceLevel: 3,
    dossier: { designation: 'Design Engineer, EW Suites', department: 'EW SBU' },
  },
];

// Self-registration applicant: no User row yet, only a PENDING request.
export const APPLICANT = {
  key: 'APPLICANT',
  fullName: 'Karthik Subramanian',
  externalId: 'BEL-EMP-4001',
  requestedSbu: 'SBU_MILCOMM',
  note: 'RF test engineer joining the Military Communication SBU. Requesting standard employee access.',
};

// classificationTier <= custodian clearance; custodian SBU matches asset SBU
// except for the admin, who holds the Cyber and Military Comm stores.
export const ZONES = [
  { zoneId: 'ZONE_ANECHOIC_CHAMBER', name: 'Anechoic Test Chamber', sbu: 'SBU_RADAR', requiredClearance: 3 },
  { zoneId: 'ZONE_RADAR_TEST', name: 'Radar Test Range Control Room', sbu: 'SBU_RADAR', requiredClearance: 2 },
  { zoneId: 'ZONE_CYBER_LAB', name: 'Cyber Security Lab', sbu: 'SBU_CYBER', requiredClearance: 4 },
  { zoneId: 'ZONE_MAIN_GATE', name: 'Main Gate Turnstile', sbu: null, requiredClearance: 1 },
];

export const ASSETS = [
  {
    ref: 'AESA',
    name: 'AESA Radar Antenna Array Module',
    sbu: 'SBU_RADAR',
    classificationTier: 4,
    custodian: 'MANAGER',
    metadata: { assetTag: 'BEL-RDR-AAM-0001', serialNumber: 'AAM-2026-0001', category: 'Radar' },
  },
  {
    ref: 'ANALYZER',
    name: 'Portable Radar Signal Analyzer',
    sbu: 'SBU_RADAR',
    classificationTier: 2,
    custodian: 'USER',
    metadata: { assetTag: 'BEL-RDR-PSA-0007', serialNumber: 'PSA-2026-0007', category: 'Test Equipment' },
  },
  {
    ref: 'CALKIT',
    name: 'Radar Calibration Reference Kit',
    sbu: 'SBU_RADAR',
    classificationTier: 1,
    custodian: 'USER',
    metadata: { assetTag: 'BEL-RDR-CRK-0012', serialNumber: 'CRK-2026-0012', category: 'Calibration' },
  },
  {
    ref: 'ESM',
    name: 'ESM Wideband Receiver',
    sbu: 'SBU_EW',
    classificationTier: 3,
    custodian: 'MANAGER2',
    metadata: { assetTag: 'BEL-EW-ESM-0003', serialNumber: 'ESM-2026-0003', category: 'Electronic Warfare' },
  },
  {
    ref: 'DRFM',
    name: 'Digital RF Memory Jammer Unit',
    sbu: 'SBU_EW',
    classificationTier: 3,
    custodian: 'USER2',
    metadata: { assetTag: 'BEL-EW-DRFM-0005', serialNumber: 'DRFM-2026-0005', category: 'Electronic Warfare' },
  },
  {
    ref: 'HFSDR',
    name: 'Tactical HF Software-Defined Radio',
    sbu: 'SBU_MILCOMM',
    classificationTier: 2,
    custodian: 'ADMIN',
    metadata: { assetTag: 'BEL-MC-SDR-0021', serialNumber: 'SDR-2026-0021', category: 'Military Communication' },
  },
  {
    ref: 'HSM',
    name: 'Hardware Security Module Cluster',
    sbu: 'SBU_CYBER',
    classificationTier: 4,
    custodian: 'ADMIN',
    metadata: { assetTag: 'BEL-CY-HSM-0002', serialNumber: 'HSM-2026-0002', category: 'Cyber Security' },
  },
];

// Pending custody transfer: the Radar test engineer hands the analyzer to the
// Radar manager (same SBU, so it needs no Cross-SBU pass).
export const TRANSFER = { asset: 'ANALYZER', from: 'USER', to: 'MANAGER', reason: 'Quarterly calibration handover' };

// Active pass: the EW engineer may hold Radar assets for a joint field trial.
// (The EW manager has no pass, so a Radar transfer to him is denied.)
export const PASS = {
  user: 'USER2',
  issuer: 'MANAGER',
  targetSbu: 'SBU_RADAR',
  reason: `${PASS_MARKER} Joint radar-EW field trial support`,
};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const ADDRESS_FLAGS = {
  '--admin': 'ADMIN',
  '--manager': 'MANAGER',
  '--manager2': 'MANAGER2',
  '--auditor': 'AUDITOR',
  '--user': 'USER',
  '--user2': 'USER2',
  '--applicant': 'APPLICANT',
};

const ADDRESS_ENV = {
  ADMIN: 'SEED_ADMIN_WALLET',
  MANAGER: 'SEED_MANAGER_WALLET',
  MANAGER2: 'SEED_MANAGER2_WALLET',
  AUDITOR: 'SEED_AUDITOR_WALLET',
  USER: 'SEED_USER_WALLET',
  USER2: 'SEED_USER2_WALLET',
  APPLICANT: 'SEED_APPLICANT_WALLET',
};

const toChecksum = (value, label) => {
  try {
    return ethers.getAddress(value.trim());
  } catch {
    throw new Error(`${label}: "${value}" is not a valid Ethereum address`);
  }
};

export function parseArgs(argv, env = process.env) {
  const opts = { dryRun: false, mode: 'onchain', printKeys: false, help: false, addresses: {} };
  let modeFlag = null;

  for (const [role, envName] of Object.entries(ADDRESS_ENV)) {
    if (env[envName]) opts.addresses[role] = toChecksum(env[envName], envName);
  }

  for (let i = 0; i < argv.length; i += 1) {
    let arg = argv[i];
    let inline = null;
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq !== -1) {
      inline = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }

    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--print-keys') opts.printKeys = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--offchain' || arg === '--onchain') {
      const mode = arg.slice(2);
      if (modeFlag && modeFlag !== mode) throw new Error('--offchain and --onchain are mutually exclusive');
      modeFlag = mode;
      opts.mode = mode;
    } else if (ADDRESS_FLAGS[arg]) {
      const value = inline ?? argv[++i];
      if (!value) throw new Error(`${arg} needs a wallet address`);
      opts.addresses[ADDRESS_FLAGS[arg]] = toChecksum(value, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const seen = new Map();
  for (const [role, address] of Object.entries(opts.addresses)) {
    if (seen.has(address)) throw new Error(`${seen.get(address)} and ${role} were given the same address ${address}`);
    seen.set(address, role);
  }
  return opts;
}

const USAGE = `Usage: node scripts/seed-demo.js [--dry-run] [--offchain | --onchain] [--print-keys]
                              [--admin 0x..] [--manager 0x..] [--manager2 0x..]
                              [--auditor 0x..] [--user 0x..] [--user2 0x..] [--applicant 0x..]

See the header comment of scripts/seed-demo.js for details.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sha = (value, length = 32) => crypto.createHash('sha256').update(value).digest('hex').slice(0, length);

// Off-chain-only stand-ins. They are deliberately not CID-shaped so nothing
// mistakes them for real IPFS content.
const placeholderCid = (kind, key) => `offchain-demo-${kind}-${sha(key)}`;
const placeholderTx = (prefix, key) => `${prefix}_demoseed_${sha(key, 16)}`;

function readWalletFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed.wallets === 'object' && parsed.wallets ? parsed.wallets : {};
  } catch {
    return {};
  }
}

function writeWalletFile(file, wallets) {
  const body = {
    note: 'Demo wallets generated by scripts/seed-demo.js. TESTNET/DEMO USE ONLY. Import the private keys into MetaMask to sign in as each role. Never commit this file.',
    updatedAt: new Date().toISOString(),
    wallets,
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

const pad = (value, width) => String(value ?? '').padEnd(width);

function printTable(out, rows, columns) {
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  out(`  ${columns.map((c, i) => pad(c, widths[i])).join('  ')}`);
  out(`  ${widths.map((w) => '-'.repeat(w)).join('  ')}`);
  for (const row of rows) out(`  ${columns.map((c, i) => pad(row[c], widths[i])).join('  ')}`);
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * @param {object} args
 * @param {object|null} args.prisma   Prisma client (null is tolerated in --dry-run)
 * @param {object} args.opts          Result of parseArgs
 * @param {object} [args.services]    { identityService, assetService, chainService } — only used in on-chain mode
 * @param {string} [args.walletsFile] Where generated wallets are stored
 * @param {Function} [args.out]       Line logger
 */
export async function seed({ prisma, opts, services, walletsFile = WALLETS_FILE, out = console.log }) {
  const dry = opts.dryRun;
  const onchain = opts.mode === 'onchain';
  const tag = (action) => (dry ? `would ${action}` : action);
  const line = (action, text) => out(`  [${pad(tag(action), dry ? 12 : 6)}] ${text}`);

  if (!dry && !prisma) throw new Error('Database unavailable: set DATABASE_URL in backend/.env');
  if (!dry && onchain && !services) throw new Error('On-chain mode needs the backend services');

  // In a dry run a missing/unreachable database just means "assume empty".
  let dbNote = null;
  const read = async (fn) => {
    if (!prisma) return null;
    try {
      return await fn(prisma);
    } catch (err) {
      if (!dry) throw err;
      dbNote = `database not readable (${err.message.split('\n').pop().trim()}); assuming an empty database`;
      return null;
    }
  };

  const stored = readWalletFile(walletsFile);
  const generated = {};
  const people = {};

  // 1. Resolve a wallet for every role, reusing anything already in the DB.
  out('\nWallets');
  for (const spec of IDENTITIES) {
    const supplied = opts.addresses[spec.key] || stored[spec.key]?.address || null;
    const or = [{ externalId: spec.externalId }];
    if (supplied) or.push({ walletAddress: supplied });
    const existing = await read((db) => db.user.findFirst({ where: { OR: or } }));

    const person = { spec, user: existing, address: supplied, source: null };
    if (existing) {
      const sameEmployee = existing.externalId === spec.externalId;
      const sameWalletAndRole = existing.walletAddress === supplied && existing.role === spec.role;
      if (!sameEmployee && !sameWalletAndRole) {
        throw new Error(
          `${spec.key}: wallet ${supplied} is already registered as ${existing.role}${existing.externalId ? ` (${existing.externalId})` : ''}. Pass a different --${spec.key.toLowerCase()} address.`
        );
      }
      if (supplied && supplied !== existing.walletAddress) {
        out(`  ! ${spec.key}: ${spec.externalId} already exists with ${existing.walletAddress}; ignoring ${supplied}`);
      }
      person.address = existing.walletAddress;
      person.source = 'existing identity';
    } else if (supplied) {
      person.source = opts.addresses[spec.key] ? 'supplied' : '.demo-wallets.json';
    } else if (dry) {
      person.source = 'would generate';
    } else {
      const wallet = ethers.Wallet.createRandom();
      generated[spec.key] = { address: wallet.address, privateKey: wallet.privateKey };
      person.address = wallet.address;
      person.source = 'generated';
    }
    people[spec.key] = person;
  }

  const applicant = { spec: APPLICANT, request: null, address: null, source: null };
  {
    const supplied = opts.addresses.APPLICANT || stored.APPLICANT?.address || null;
    const or = [{ externalId: APPLICANT.externalId }];
    if (supplied) or.push({ walletAddress: supplied });
    const request = await read((db) => db.registrationRequest.findFirst({ where: { OR: or } }));
    const registeredUser = await read((db) => db.user.findFirst({ where: { externalId: APPLICANT.externalId } }));
    applicant.request = request;
    applicant.registeredUser = registeredUser;
    applicant.address = request ? request.walletAddress : supplied;
    if (request) applicant.source = 'existing request';
    else if (supplied) applicant.source = opts.addresses.APPLICANT ? 'supplied' : '.demo-wallets.json';
    else if (dry) applicant.source = 'would generate';
    else {
      const wallet = ethers.Wallet.createRandom();
      generated.APPLICANT = { address: wallet.address, privateKey: wallet.privateKey };
      applicant.address = wallet.address;
      applicant.source = 'generated';
    }
  }

  // Persist generated keys before any write so a later failure never loses them.
  const pendingGeneration = [...Object.values(people), applicant].filter((p) => p.source === 'would generate').length;
  if (Object.keys(generated).length) {
    writeWalletFile(walletsFile, { ...stored, ...generated });
    out(`  Saved ${Object.keys(generated).length} generated wallet(s) to ${walletsFile}`);
  } else if (pendingGeneration) {
    out(`  ${pendingGeneration} wallet(s) would be generated and saved to ${walletsFile}`);
  } else {
    out('  No new wallets needed.');
  }

  // 2. Identities
  out('\nIdentities');
  for (const person of Object.values(people)) {
    const { spec } = person;
    const label = `${spec.role.padEnd(7)} ${spec.fullName} (${spec.externalId}, ${spec.sbu}, clearance ${spec.clearanceLevel})`;
    if (person.user) {
      line('exists', label);
      continue;
    }
    line('create', label);
    if (dry) continue;

    if (onchain) {
      const result = await services.identityService.registerIdentity({
        walletAddress: person.address,
        externalId: spec.externalId,
        fullName: spec.fullName,
        displayName: spec.fullName,
        role: spec.role,
        clearanceLevel: spec.clearanceLevel,
        sbu: spec.sbu,
        piiDossier: spec.dossier,
      });
      person.user = result.user;
    } else {
      const identitySalt = crypto.randomBytes(16).toString('hex');
      person.user = await prisma.user.create({
        data: {
          walletAddress: person.address,
          externalId: spec.externalId,
          did: buildDid({ externalId: spec.externalId, walletAddress: person.address }),
          displayName: spec.fullName,
          role: spec.role,
          clearanceLevel: spec.clearanceLevel,
          sbu: spec.sbu,
          identityHash: computeIdentityHash({
            externalId: spec.externalId,
            fullName: spec.fullName,
            sbu: spec.sbu,
            salt: identitySalt,
          }),
          identitySalt,
          // Placeholder, not a real IPFS CID: no dossier is pinned in offchain mode.
          dossierCid: placeholderCid('dossier', spec.externalId),
        },
      });
    }
  }

  const adminUser = people.ADMIN.user;
  const idOf = (key) => people[key].user?.id ?? `<${key}>`;

  // Audit rows the event indexer would normally produce; only synthesised offchain.
  const auditOnce = async ({ type, actorId, targetId, txHash, payload }) => {
    const existing = await prisma.auditEvent.findFirst({ where: { type, txHash } });
    if (existing) return;
    await prisma.auditEvent.create({
      data: { type, actorId: actorId ?? null, targetId, txHash, blockNumber: 0n, payload: { ...payload, demoSeed: true, offChain: true } },
    });
  };

  if (!dry && !onchain) {
    for (const person of Object.values(people)) {
      await auditOnce({
        type: 'IDENTITY_CREATED',
        actorId: adminUser.id,
        targetId: person.user.id,
        txHash: placeholderTx('0xoffchain', `identity:${person.spec.externalId}`),
        payload: { externalId: person.spec.externalId, role: person.spec.role, sbu: person.spec.sbu },
      });
    }
  }

  // 3. Facility zones
  out('\nFacility zones');
  for (const zone of ZONES) {
    const label = `${zone.zoneId} (${zone.sbu ?? 'any SBU'}, clearance ${zone.requiredClearance})`;
    const existing = await read((db) => db.facilityZone.findUnique({ where: { zoneId: zone.zoneId } }));
    const same =
      existing &&
      existing.name === zone.name &&
      existing.sbu === zone.sbu &&
      existing.requiredClearance === zone.requiredClearance;
    if (same) {
      line('exists', label);
      continue;
    }
    line(existing ? 'update' : 'create', label);
    if (dry) continue;

    let isEmergencyLocked = existing?.isEmergencyLocked ?? false;
    if (onchain) {
      const chain = await services.chainService.configureZoneOnChain(zone);
      if (chain.error) throw new Error(`On-chain zone configuration failed for ${zone.zoneId}: ${chain.error}`);
      // createZone() clears the lockdown flag on the contract; mirror that.
      if (chain.confirmed) isEmergencyLocked = false;
    }
    await prisma.facilityZone.upsert({
      where: { zoneId: zone.zoneId },
      create: { zoneId: zone.zoneId, name: zone.name, sbu: zone.sbu, requiredClearance: zone.requiredClearance },
      update: { name: zone.name, sbu: zone.sbu, requiredClearance: zone.requiredClearance, isEmergencyLocked },
    });
  }

  // 4. Assets
  out('\nAssets');
  const assets = {};
  for (const spec of ASSETS) {
    const custodian = people[spec.custodian];
    const label = `T${spec.classificationTier} ${spec.sbu.padEnd(11)} ${spec.name} -> ${custodian.spec.fullName}`;
    const existing = await read((db) => db.asset.findFirst({ where: { name: spec.name } }));
    if (existing) {
      assets[spec.ref] = existing;
      line('exists', label);
      continue;
    }
    line('create', label);
    if (dry) continue;

    const metadata = { ...spec.metadata, demoSeed: true };
    if (onchain) {
      const result = await services.assetService.mintAsset(adminUser, {
        name: spec.name,
        classificationTier: spec.classificationTier,
        sbu: spec.sbu,
        ownerId: custodian.user.id,
        metadata,
      });
      assets[spec.ref] = result.asset;
    } else {
      const asset = await prisma.asset.create({
        data: {
          name: spec.name,
          tokenId: null,
          // Placeholder, not a real IPFS CID: nothing is pinned in offchain mode.
          cid: placeholderCid('asset', spec.name),
          classificationTier: spec.classificationTier,
          sbu: spec.sbu,
          metadata,
          mintTxHash: null,
          ownerId: custodian.user.id,
        },
      });
      assets[spec.ref] = asset;
      await auditOnce({
        type: 'ASSET_MINTED',
        actorId: adminUser.id,
        targetId: asset.id,
        txHash: placeholderTx('0xoffchain', `asset:${spec.name}`),
        payload: { assetId: asset.id, name: asset.name, classificationTier: asset.classificationTier, sbu: asset.sbu, custodianId: custodian.user.id },
      });
    }
  }

  // 5. Pending transfer request
  out('\nTransfer request');
  {
    const asset = assets[TRANSFER.asset];
    const label = `${ASSETS.find((a) => a.ref === TRANSFER.asset).name}: ${people[TRANSFER.from].spec.fullName} -> ${people[TRANSFER.to].spec.fullName} (PENDING)`;
    const pending = asset
      ? await read((db) => db.transferRequest.findFirst({ where: { assetId: asset.id, status: 'PENDING' } }))
      : null;
    if (pending) {
      line('exists', label);
    } else if (asset && asset.ownerId !== idOf(TRANSFER.from)) {
      out(`  [skip  ] ${label}: custody has moved since seeding`);
    } else {
      line('create', label);
      if (!dry) {
        const transfer = await prisma.transferRequest.create({
          data: {
            assetId: asset.id,
            fromUserId: idOf(TRANSFER.from),
            toUserId: idOf(TRANSFER.to),
            requestedById: idOf(TRANSFER.from),
            status: 'PENDING',
          },
        });
        await auditOnce({
          type: 'TRANSFER_REQUESTED',
          actorId: idOf(TRANSFER.from),
          targetId: asset.id,
          txHash: placeholderTx('0xreq', `transfer:${asset.id}`),
          payload: {
            transferRequestId: transfer.id,
            assetId: asset.id,
            assetName: asset.name,
            fromUserId: idOf(TRANSFER.from),
            toUserId: idOf(TRANSFER.to),
            reason: TRANSFER.reason,
          },
        });
      }
    }
  }

  // 6. Cross-SBU pass
  out('\nCross-SBU pass');
  {
    const label = `${people[PASS.user].spec.fullName} -> ${PASS.targetSbu} for ${PASS_VALID_DAYS} days, issued by ${people[PASS.issuer].spec.fullName}`;
    const userId = idOf(PASS.user);
    const existing = people[PASS.user].user
      ? await read((db) =>
          db.crossSbuPass.findFirst({
            where: { userId, targetSbu: PASS.targetSbu, reason: PASS.reason },
          })
        )
      : null;
    const validUntil = new Date(Date.now() + PASS_VALID_DAYS * 24 * 3600 * 1000);
    if (existing) {
      line('renew', label);
      if (!dry) await prisma.crossSbuPass.update({ where: { id: existing.id }, data: { validUntil } });
    } else {
      line('create', label);
      if (!dry) {
        await prisma.crossSbuPass.create({
          data: { userId, targetSbu: PASS.targetSbu, validUntil, reason: PASS.reason, issuedById: idOf(PASS.issuer) },
        });
      }
    }
  }

  // 7. Pending registration request
  out('\nRegistration request');
  {
    const label = `${APPLICANT.fullName} (${APPLICANT.externalId}, ${APPLICANT.requestedSbu}) PENDING`;
    if (applicant.request) {
      line('exists', `${label.replace('PENDING', applicant.request.status)}`);
    } else if (applicant.registeredUser) {
      out(`  [skip  ] ${APPLICANT.externalId} is already a registered identity`);
    } else {
      line('create', label);
      if (!dry) {
        await prisma.registrationRequest.create({
          data: {
            walletAddress: applicant.address,
            fullName: APPLICANT.fullName,
            externalId: APPLICANT.externalId,
            requestedSbu: APPLICANT.requestedSbu,
            note: APPLICANT.note,
            status: 'PENDING',
          },
        });
      }
    }
  }

  if (dbNote) out(`\nNote: ${dbNote}`);

  // 8. Summary
  const keySource = (key) => generated[key] || stored[key];
  const rows = [
    ...Object.values(people).map((p) => ({
      Role: p.spec.key,
      Name: p.spec.fullName,
      'Employee ID': p.spec.externalId,
      SBU: p.spec.sbu,
      Clr: p.spec.clearanceLevel,
      Address: p.address ?? '(generated on real run)',
      Wallet: p.source,
    })),
    {
      Role: 'APPLICANT',
      Name: APPLICANT.fullName,
      'Employee ID': APPLICANT.externalId,
      SBU: APPLICANT.requestedSbu,
      Clr: '-',
      Address: applicant.address ?? '(generated on real run)',
      Wallet: applicant.source,
    },
  ];
  out(`\nDemo accounts (${dry ? 'dry run - nothing written' : 'ready'})`);
  printTable(out, rows, ['Role', 'Name', 'Employee ID', 'SBU', 'Clr', 'Address', 'Wallet']);

  if (!dry) {
    const withKeys = rows.filter((r) => keySource(r.Role)?.privateKey);
    if (withKeys.length) {
      out(`\nPrivate keys for generated wallets are in ${walletsFile}`);
      if (opts.printKeys) {
        out('Private keys (demo/testnet only - do not share):');
        for (const r of withKeys) out(`  ${pad(r.Role, 10)} ${keySource(r.Role).privateKey}`);
      } else {
        out('Re-run with --print-keys to print them, or import them from that file into MetaMask.');
      }
    }
    if (rows.some((r) => r.Wallet === 'existing identity' && !keySource(r.Role)?.privateKey)) {
      out('Roles marked "existing identity" without a saved key must be signed into with their own wallet.');
    }
  }

  return { people, assets, generated };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function describeDatabase() {
  try {
    const url = new URL(config.databaseUrl);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function preflightOnchain(services) {
  const missing = [];
  if (!config.rpcUrl) missing.push('RPC_URL');
  if (!config.contractAddress && !config.assetNftAddress) missing.push('CONTRACT_ADDRESS (AssetNFT)');
  if (!config.identityRegistryAddress) missing.push('IDENTITY_REGISTRY_ADDRESS');
  if (!config.accessControlAddress) missing.push('ACCESS_CONTROL_ADDRESS');
  if (!config.deployerPrivateKey) missing.push('DEPLOYER_PRIVATE_KEY');
  if (!services.ipfsService.isConfigured()) missing.push('PINATA_JWT (or PINATA_API_KEY + PINATA_API_SECRET)');
  if (!services.chainService.isConfigured()) missing.push('a loadable contract ABI for AssetNFT');
  if (missing.length) {
    throw new Error(`On-chain mode needs these in backend/.env: ${missing.join(', ')}. Use --offchain for a DB-only demo.`);
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const pk = config.deployerPrivateKey.trim();
  const deployer = new ethers.Wallet(pk.startsWith('0x') ? pk : `0x${pk}`, provider);
  const balance = await provider.getBalance(deployer.address);
  provider.destroy();
  console.log(`Deployer ${deployer.address} balance: ${ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    throw new Error('The deployer wallet has no ETH for gas. Fund it, or use --offchain.');
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`\n${err.message}\n\n${USAGE}\n`);
    process.exit(1);
  }
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  console.log(`BELTAL demo seed - mode: ${opts.mode}${opts.dryRun ? ' (dry run, nothing will be written)' : ''}`);
  console.log(`Target database: ${config.databaseUrl ? describeDatabase() : '(DATABASE_URL not set)'}`);

  const { default: prisma } = await import('../src/config/db.js');
  let exitCode = 0;
  try {
    let services;
    if (opts.mode === 'onchain' && !opts.dryRun) {
      const [{ default: identityService }, { default: assetService }, { default: chainService }, { default: ipfsService }] =
        await Promise.all([
          import('../src/services/identity.service.js'),
          import('../src/services/asset.service.js'),
          import('../src/services/chain.service.js'),
          import('../src/services/ipfs.service.js'),
        ]);
      services = { identityService, assetService, chainService, ipfsService };
      await preflightOnchain(services);
    }
    await seed({ prisma, opts, services });
    console.log(opts.dryRun ? '\nDry run complete. Nothing was written.\n' : '\nSeed complete. Safe to re-run.\n');
  } catch (err) {
    console.error(`\nSeed failed: ${err.message}`);
    if (!opts.dryRun) console.error('Completed steps are kept; fix the problem and re-run (existing records are skipped).\n');
    exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
  process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
