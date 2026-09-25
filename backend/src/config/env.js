import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env explicitly from backend directory regardless of cwd
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// One service-level secret (like JWT_SECRET), not per-user. In production this
// would come from a KMS/secrets manager via envelope encryption (a master key
// wraps a small per-record data key, so rotation doesn't mean re-encrypting
// every dossier) with a distinct key per environment — never this literal
// process.env read against a plaintext .env file.
let dossierEncryptionKey = process.env.DOSSIER_ENCRYPTION_KEY;
if (!dossierEncryptionKey) {
  dossierEncryptionKey = crypto.randomBytes(32).toString('hex');
  console.warn(
    'DOSSIER_ENCRYPTION_KEY is unset — generated an ephemeral dev key; encrypted PII dossiers will not be decryptable after a restart. Set DOSSIER_ENCRYPTION_KEY (32-byte hex) in .env for real use.'
  );
}

// Integer env var with a fallback; anything unset, non-numeric or below `min`
// falls back to the default rather than producing NaN downstream.
function intFromEnv(raw, fallback, { min = 0 } = {}) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
}

// Comma-separated wallet addresses allowed to bootstrap the first ADMIN(s).
// Entries are checksum-normalised; malformed ones are skipped with a warning.
export function parseAdminWallets(raw = '') {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      try {
        return [ethers.getAddress(entry)];
      } catch {
        console.warn(`ADMIN_WALLETS: ignoring invalid address "${entry}"`);
        return [];
      }
    });
}

// No hard-coded fallback in production: a guessable signing secret would let
// anyone mint an ADMIN token.
const DEV_JWT_SECRET = 'trustchain-dev-secret-key-32chars-min-len';
const jwtSecret = process.env.JWT_SECRET || DEV_JWT_SECRET;
if (process.env.NODE_ENV === 'production' && jwtSecret === DEV_JWT_SECRET) {
  throw new Error('JWT_SECRET must be set to a private value when NODE_ENV=production');
}

export default {
  port: Number(process.env.PORT) || 4000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  rpcUrl: process.env.RPC_URL,
  contractAddress: process.env.CONTRACT_ADDRESS || process.env.ASSET_NFT_ADDRESS,
  assetNftAddress: process.env.ASSET_NFT_ADDRESS || process.env.CONTRACT_ADDRESS,
  auditLogAddress: process.env.AUDIT_LOG_ADDRESS,
  identityRegistryAddress: process.env.IDENTITY_REGISTRY_ADDRESS,
  accessControlAddress: process.env.ACCESS_CONTROL_ADDRESS,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  ipfsApiKey: process.env.IPFS_API_KEY,
  pinataJwt: process.env.PINATA_JWT,
  pinataApiKey: process.env.PINATA_API_KEY,
  pinataApiSecret: process.env.PINATA_API_SECRET,
  pinataGateway: process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud/ipfs',
  // Optional: pins every BELTAL upload into one dedicated Pinata group.
  pinataGroupId: process.env.PINATA_GROUP_ID,

  // AI query assistant (issues #49/#50). Optional: with no key the assistant
  // routes report themselves as unconfigured and the UI hides the panel.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,

  // Anti-Tamper Lab demo tools: lets an ADMIN/AUDITOR forge a value in the
  // Postgres cache (never the chain) so the audit check has something to catch.
  // On by default except in production; ENABLE_TAMPER_SIMULATION=true/false
  // overrides either way.
  tamperSimulationEnabled:
    process.env.ENABLE_TAMPER_SIMULATION !== undefined
      ? process.env.ENABLE_TAMPER_SIMULATION.trim().toLowerCase() === 'true'
      : process.env.NODE_ENV !== 'production',

  // Guardian approvals required before a recovery may be executed (issue #51).
  // Capped at the number of guardians the identity actually has.
  recoveryApprovalThreshold: process.env.RECOVERY_APPROVAL_THRESHOLD || '2',
  deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY,
  // Dedicated custodial wallet for the ROLE_SYSTEM_CONNECTOR machine identity
  // (issue #74) — kept separate from deployerPrivateKey so automated
  // PACS/HRMS-submitted transactions are attributable to the machine
  // identity on-chain, not the human admin service key.
  systemConnectorPrivateKey: process.env.SYSTEM_CONNECTOR_PRIVATE_KEY,
  dossierEncryptionKey,
  adminWallets: parseAdminWallets(process.env.ADMIN_WALLETS),
  // On-chain event indexer (see services/indexer.service.js)
  indexerFromBlock: intFromEnv(process.env.INDEXER_FROM_BLOCK, undefined),
  indexerLookbackBlocks: intFromEnv(process.env.INDEXER_LOOKBACK_BLOCKS, 50000, { min: 1 }),
  indexerChunkSize: intFromEnv(process.env.INDEXER_CHUNK_SIZE, 2000, { min: 1 }),
  indexerPollIntervalMs: intFromEnv(process.env.INDEXER_POLL_INTERVAL_MS, 10000, { min: 1000 }),
  indexerConfirmations: intFromEnv(process.env.INDEXER_CONFIRMATIONS, 1),
};
