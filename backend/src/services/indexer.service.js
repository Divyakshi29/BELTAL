import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import defaultPrisma from '../config/db.js';
import defaultProvider from '../config/blockchain.js';
import defaultConfig from '../config/env.js';
import logger from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const contractsDir = path.join(__dirname, '../config/contracts');

function loadAbi(name) {
  try {
    const file = path.join(contractsDir, `${name}.json`);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed.abi || parsed;
    }
  } catch (err) {
    logger.warn(`[Indexer] Failed to load ${name} ABI: ${err.message}`);
  }
  return null;
}

// AuditLog.logEvent(eventType, ...) strings emitted by the contracts, mapped
// to the AuditEventType enum. The schema has no dedicated bucket for
// access-control configuration changes, so those share ROLE_ASSIGNED and
// payload.rawEventType disambiguates them. Unlisted strings are skipped
// rather than guessed at.
const SECURITY_EVENT_TYPES = {
  DID_REG: 'IDENTITY_CREATED',
  BATCH_DID_REG: 'IDENTITY_CREATED',
  DID_REVOKE: 'ROLE_ASSIGNED',
  CLEARANCE_UPDATE: 'ROLE_ASSIGNED',
  ROLE_GRANTED: 'ROLE_ASSIGNED',
  ROLE_REVOKED: 'ROLE_ASSIGNED',
  ZONE_CONFIG: 'ROLE_ASSIGNED',
  TEMP_PASS_GRANT: 'ROLE_ASSIGNED',
  LOCKDOWN: 'ROLE_ASSIGNED',
  ASSET_MINT: 'ASSET_MINTED',
  ASSET_XFER: 'OWNERSHIP_TRANSFERRED',
  CUSTODY_TRANSFERRED: 'OWNERSHIP_TRANSFERRED',
  ACCESS_OK: 'PACS_ACCESS_GRANTED',
  ACCESS_DENY: 'PACS_ACCESS_DENIED',
};

function decodeBytes32(value) {
  try {
    return ethers.decodeBytes32String(value);
  } catch {
    return value;
  }
}

// A public RPC rejects eth_getLogs ranges that are too wide or return too many
// results; the message wording differs per provider.
function isRangeError(err) {
  return /range|limit|exceed|too many|too large|10000|block/i.test(`${err?.message || ''} ${err?.shortMessage || ''}`);
}

/**
 * Builds the on-chain event indexer. Dependencies are injectable so the sync
 * loop can be exercised without the real DB/provider singletons.
 *
 * Every event is read by one code path: a serialized loop that pulls logs for
 * [checkpoint + 1, head - confirmations] in chunks, hands each to its handler,
 * and only then advances a Postgres checkpoint. On start-up that loop is the
 * backfill (events emitted while the server was down); afterwards it keeps
 * running on an interval. Handlers are idempotent (dedupe on txHash + type),
 * so re-reading a range after a crash or a failed chunk is safe.
 */
export function createIndexer({
  prisma = defaultPrisma,
  provider = defaultProvider,
  config = defaultConfig,
} = {}) {
  let timer = null;
  let syncing = false;
  let memoryCheckpoint = null;
  let checkpointStoreWarned = false;

  async function upsertAuditEvent({ type, actorId, targetId, txHash, blockNumber, payload }) {
    // Errors propagate on purpose: the caller must not advance the checkpoint
    // past an event that failed to persist.
    const existing = await prisma.auditEvent.findFirst({ where: { txHash, type } });
    if (existing) return;

    await prisma.auditEvent.create({
      data: {
        type,
        actorId: actorId || null,
        targetId: targetId || null,
        txHash,
        blockNumber: BigInt(blockNumber || 0),
        payload: payload || {},
      },
    });
    logger.info(`[Indexer] Indexed ${type} event from tx ${txHash}`);
  }

  async function resolveUserByWallet(wallet) {
    if (!wallet || wallet === ethers.ZeroAddress) return null;
    let checksum;
    try {
      checksum = ethers.getAddress(wallet);
    } catch {
      return null;
    }
    return prisma.user.findUnique({ where: { walletAddress: checksum }, select: { id: true } });
  }

  async function resolveAssetByTokenId(tokenId) {
    if (tokenId === undefined || tokenId === null) return null;
    return prisma.asset.findUnique({ where: { tokenId: tokenId.toString() }, select: { id: true, ownerId: true } });
  }

  // Handlers take the decoded event args (positional, as declared in the ABI)
  // and the log's position on chain.
  const handlers = {
    'auditLog:SecurityAuditLog': async ([eventType, actor, target, entityId, timestamp, details], { txHash, blockNumber }) => {
      const rawEventType = decodeBytes32(eventType);
      const type = SECURITY_EVENT_TYPES[rawEventType];
      if (!type) {
        logger.debug?.(`[Indexer] SecurityAuditLog ${rawEventType} has no audit-trail mapping; skipped`);
        return;
      }
      const actorUser = await resolveUserByWallet(actor);
      await upsertAuditEvent({
        type,
        actorId: actorUser?.id,
        targetId: target !== ethers.ZeroAddress ? target : null,
        txHash,
        blockNumber,
        payload: {
          rawEventType,
          actor,
          target,
          entityId,
          details,
          onChainTimestamp: timestamp.toString(),
        },
      });
    },

    'assetNft:AssetMinted': async ([tokenId, initialCustodian, assetTag, classificationTier, sbu, tokenURI], { txHash, blockNumber }) => {
      const actorUser = await resolveUserByWallet(initialCustodian);
      const assetRec = await resolveAssetByTokenId(tokenId);
      await upsertAuditEvent({
        type: 'ASSET_MINTED',
        actorId: actorUser?.id,
        targetId: assetRec?.id,
        txHash,
        blockNumber,
        payload: {
          tokenId: tokenId.toString(),
          custodian: initialCustodian,
          assetTag,
          classificationTier: Number(classificationTier),
          sbu: decodeBytes32(sbu),
          tokenURI,
        },
      });
    },

    'assetNft:CustodyReassigned': async ([tokenId, previousCustodian, newCustodian, reason, timestamp], { txHash, blockNumber }) => {
      const newCustodianUser = await resolveUserByWallet(newCustodian);
      const assetRec = await resolveAssetByTokenId(tokenId);
      await upsertAuditEvent({
        type: 'OWNERSHIP_TRANSFERRED',
        actorId: newCustodianUser?.id,
        targetId: assetRec?.id,
        txHash,
        blockNumber,
        payload: {
          tokenId: tokenId.toString(),
          previousCustodian,
          newCustodian,
          reason,
          onChainTimestamp: timestamp.toString(),
        },
      });
    },

    'identityRegistry:IdentityCreated': async ([user, did, hash, clearanceLevel, sbuCode], { txHash, blockNumber }) => {
      const actorUser = await resolveUserByWallet(user);
      await upsertAuditEvent({
        type: 'IDENTITY_CREATED',
        actorId: actorUser?.id,
        targetId: did,
        txHash,
        blockNumber,
        payload: {
          user,
          did,
          identityHash: hash,
          clearanceLevel: Number(clearanceLevel),
          sbu: decodeBytes32(sbuCode),
        },
      });
    },

    'identityRegistry:ClearanceUpdated': async ([user, oldClearance, newClearance], { txHash, blockNumber }) => {
      const actorUser = await resolveUserByWallet(user);
      await upsertAuditEvent({
        type: 'ROLE_ASSIGNED',
        actorId: actorUser?.id,
        targetId: user,
        txHash,
        blockNumber,
        payload: {
          user,
          oldClearance: Number(oldClearance),
          newClearance: Number(newClearance),
        },
      });
    },

    // Emergency lockdown toggles (issue #76). No dedicated AuditEventType
    // exists for zone-lockdown admin actions, so this shares ROLE_ASSIGNED
    // with the other access-control configuration changes.
    'accessControl:EmergencyLockdownToggled': async ([zoneId, isLockedDown, actor], { txHash, blockNumber }) => {
      const zoneIdStr = decodeBytes32(zoneId);
      const actorUser = await resolveUserByWallet(actor);
      logger.info(`[Indexer] EmergencyLockdownToggled: zone ${zoneIdStr} -> ${isLockedDown ? 'LOCKED' : 'UNLOCKED'} (Actor: ${actor})`);
      await upsertAuditEvent({
        type: 'ROLE_ASSIGNED',
        actorId: actorUser?.id,
        targetId: zoneIdStr,
        txHash,
        blockNumber,
        payload: {
          eventSource: 'EMERGENCY_LOCKDOWN_TOGGLE',
          zoneId: zoneIdStr,
          isLockedDown,
          actor,
        },
      });
    },
  };

  const sourceDefs = [
    { key: 'auditLog', abiName: 'AuditLog', address: config.auditLogAddress },
    { key: 'assetNft', abiName: 'AssetNFT', address: config.contractAddress },
    { key: 'identityRegistry', abiName: 'IdentityRegistry', address: config.identityRegistryAddress },
    { key: 'accessControl', abiName: 'AccessControl', address: config.accessControlAddress },
  ];

  // Contracts we can decode: address configured and ABI present.
  const sources = new Map();
  for (const def of sourceDefs) {
    const abi = def.address ? loadAbi(def.abiName) : null;
    if (!def.address || !abi) continue;
    sources.set(def.address.toLowerCase(), {
      key: def.key,
      address: def.address,
      iface: new ethers.Interface(abi),
    });
  }

  async function processLog(log) {
    const source = sources.get(log.address.toLowerCase());
    if (!source) return;
    const parsed = source.iface.parseLog({ topics: log.topics, data: log.data });
    if (!parsed) return;
    const handler = handlers[`${source.key}:${parsed.name}`];
    if (!handler) return;
    await handler(parsed.args, { txHash: log.transactionHash, blockNumber: log.blockNumber });
  }

  // The checkpoint is keyed by chain and contract set, so redeploying the
  // contracts (new addresses) starts a fresh backfill instead of resuming a
  // stale position.
  function checkpointId(chainId) {
    const addresses = [...sources.keys()].sort().join(',');
    return `${chainId}:${ethers.id(addresses).slice(2, 10)}`;
  }

  async function loadCheckpoint(id) {
    try {
      const row = await prisma.indexerCheckpoint.findUnique({ where: { id } });
      return row ? Number(row.lastBlock) : null;
    } catch (err) {
      warnCheckpointStore(err);
      return memoryCheckpoint;
    }
  }

  async function saveCheckpoint(id, lastBlock) {
    memoryCheckpoint = lastBlock;
    try {
      await prisma.indexerCheckpoint.upsert({
        where: { id },
        update: { lastBlock: BigInt(lastBlock) },
        create: { id, lastBlock: BigInt(lastBlock) },
      });
    } catch (err) {
      warnCheckpointStore(err);
    }
  }

  function warnCheckpointStore(err) {
    if (checkpointStoreWarned) return;
    checkpointStoreWarned = true;
    logger.warn(
      `[Indexer] Checkpoint table unavailable (${err.message}); progress is kept in memory only and a restart will re-scan. Run "prisma migrate deploy".`
    );
  }

  /**
   * One pass of the loop: index everything between the checkpoint and the
   * (confirmed) chain head. Resolves with the number of blocks covered.
   */
  async function syncOnce() {
    if (syncing) return 0;
    syncing = true;
    try {
      const { chainId } = await provider.getNetwork();
      const id = checkpointId(chainId);
      const head = await provider.getBlockNumber();
      const target = head - config.indexerConfirmations;

      let last = await loadCheckpoint(id);
      if (last !== null && last > target) {
        // Checkpoint is ahead of the chain (e.g. RPC pointed at a different network).
        logger.warn(`[Indexer] Checkpoint ${last} is ahead of chain head ${head}; re-scanning from the configured start.`);
        last = null;
      }
      if (last === null) {
        const configured = config.indexerFromBlock;
        if (configured === undefined) {
          logger.warn(
            `[Indexer] No checkpoint and INDEXER_FROM_BLOCK unset; scanning the last ${config.indexerLookbackBlocks} blocks. Set INDEXER_FROM_BLOCK to the contracts' deployment block for a full history.`
          );
        }
        last = (configured ?? Math.max(0, target - config.indexerLookbackBlocks)) - 1;
      }

      let from = last + 1;
      if (from > target) return 0;

      const total = target - from + 1;
      if (total > config.indexerChunkSize) {
        logger.info(`[Indexer] Catching up ${total} blocks (${from} -> ${target})`);
      }

      const addresses = [...sources.values()].map((s) => s.address);
      let chunk = config.indexerChunkSize;
      while (from <= target) {
        const to = Math.min(from + chunk - 1, target);
        let logs;
        try {
          logs = await provider.getLogs({ address: addresses, fromBlock: from, toBlock: to });
        } catch (err) {
          if (chunk > 1 && isRangeError(err)) {
            chunk = Math.max(1, Math.floor(chunk / 2));
            logger.debug?.(`[Indexer] RPC rejected the block range; retrying with ${chunk}-block chunks`);
            continue;
          }
          throw err;
        }

        logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
        for (const log of logs) await processLog(log);

        await saveCheckpoint(id, to);
        from = to + 1;
      }
      return total;
    } finally {
      syncing = false;
    }
  }

  async function safeSync() {
    try {
      await syncOnce();
    } catch (err) {
      // Checkpoint stays at the last fully processed chunk; the next tick retries.
      logger.warn(`[Indexer] Sync failed, will retry: ${err.message}`);
    }
  }

  async function start() {
    if (!provider) {
      logger.warn('[Indexer] Provider not available; indexer disabled.');
      return;
    }
    if (!prisma) {
      logger.warn('[Indexer] Database not available; indexer disabled.');
      return;
    }
    if (sources.size === 0) {
      logger.warn('[Indexer] No contract addresses/ABIs configured; indexer disabled.');
      return;
    }

    // JsonRpcProvider retries indefinitely when its endpoint is unreachable.
    // Verify connectivity before starting so a bad development RPC_URL does
    // not leave the backend producing retry noise forever.
    try {
      await provider.getNetwork();
    } catch (err) {
      logger.warn(`[Indexer] RPC endpoint unavailable; indexer disabled: ${err.message}`);
      provider.destroy?.();
      return;
    }

    for (const source of sources.values()) {
      logger.info(`[Indexer] Watching ${source.key} (${source.address})`);
    }

    await safeSync(); // backfill anything missed while the server was down
    timer = setInterval(safeSync, config.indexerPollIntervalMs);
    timer.unref?.();
    logger.info(`[Indexer] On-chain event indexer active (polling every ${config.indexerPollIntervalMs}ms, ${config.indexerConfirmations} confirmation(s))`);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, syncOnce };
}

let instance = null;

export async function startIndexer() {
  instance ??= createIndexer();
  return instance.start();
}

export default { startIndexer, createIndexer };
