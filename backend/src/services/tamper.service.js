import prisma from '../config/db.js';
import provider from '../config/blockchain.js';
import config from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import ipfsService from './ipfs.service.js';
import { computeIdentityHash, decryptDossier } from '../utils/dossier.util.js';
import chainService from './chain.service.js';

// Any of these on an identity means the database disagrees with an
// independent source (the chain or the encrypted dossier).
const IDENTITY_DRIFT_STATUSES = new Set([
  'HASH_DRIFT',
  'SBU_DRIFT',
  'ON_CHAIN_HASH_DRIFT',
  'ON_CHAIN_SBU_DRIFT',
  'CLEARANCE_DRIFT',
  'STATUS_DRIFT',
]);

function assertSimulationEnabled() {
  if (!config.tamperSimulationEnabled) {
    throw new ApiError(403, 'Tamper simulation is disabled on this server (ENABLE_TAMPER_SIMULATION).');
  }
}

async function findIdentity(id) {
  const user = await prisma.user.findFirst({ where: { OR: [{ id }, { externalId: id }] } });
  if (!user) throw new ApiError(404, 'Employee identity not found');
  return user;
}

async function findAsset(id) {
  const asset = await prisma.asset.findFirst({ where: { OR: [{ id }, { tokenId: id }] } });
  if (!asset) throw new ApiError(404, 'Asset not found');
  return asset;
}

/**
 * Anti-Tamper Verification Service (Issue #47 flagship feature).
 *
 * Given an asset ID or employee ID, independently re-derives the expected
 * cryptographic state (CID from IPFS, hash from dossier, custodian from DB)
 * and cross-checks it against the live Ethereum Sepolia on-chain state.
 *
 * A mismatch means the PostgreSQL read-cache was tampered with directly,
 * bypassing the application layer.
 */
export const tamperService = {
  /**
   * Verify a single asset's integrity:
   * 1. Load asset from PostgreSQL.
   * 2. Query on-chain: getAssetDetails(tokenId) and getCustodian(tokenId).
   * 3. Compare CID and custodian address.
   */
  async verifyAssetIntegrity(assetId) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const asset = await prisma.asset.findFirst({
      where: { OR: [{ id: assetId }, { tokenId: assetId }] },
      include: {
        owner: {
          select: {
            id: true,
            displayName: true,
            walletAddress: true,
            externalId: true,
          },
        },
      },
    });

    if (!asset) throw new ApiError(404, 'Asset not found');

    const report = {
      assetId: asset.id,
      tokenId: asset.tokenId,
      assetName: asset.name,
      checkedAt: new Date().toISOString(),
      onChainAvailable: false,
      verifications: [],
    };

    // --- On-Chain Check ---
    if (!asset.tokenId) {
      report.onChainAvailable = false;
      report.verifications.push({
        check: 'ON_CHAIN_TOKEN',
        status: 'SKIPPED',
        reason: 'Asset has no on-chain tokenId — minted off-chain only',
      });
      report.verdict = 'PARTIAL';
      return report;
    }

    const onChain = await chainService.getAssetOnChain(asset.tokenId);

    if (!onChain.found) {
      report.onChainAvailable = false;
      report.verifications.push({
        check: 'ON_CHAIN_TOKEN',
        status: 'NOT_FOUND',
        reason: onChain.error || `Token #${asset.tokenId} not found on-chain`,
      });
      report.verdict = 'PARTIAL';
      return report;
    }

    report.onChainAvailable = true;

    // --- Check 1: CID integrity (IPFS URI drift detection) ---
    const onChainCid = onChain.tokenURI.replace(/^ipfs:\/\//, '');
    const cidMatch = onChainCid === asset.cid;

    report.verifications.push({
      check: 'CID_INTEGRITY',
      status: cidMatch ? 'CID_MATCH' : 'CID_DRIFT',
      dbValue: asset.cid,
      onChainValue: onChainCid,
      description: cidMatch
        ? 'IPFS CID in PostgreSQL matches on-chain tokenURI'
        : 'ALERT: IPFS CID in PostgreSQL does NOT match on-chain tokenURI — potential DB tampering detected',
    });

    // --- Check 2: Current custodian wallet address ---
    const expectedCustodian = (asset.owner?.walletAddress || '').toLowerCase();
    const onChainCustodian = (onChain.custodian || '').toLowerCase();
    const custodianMatch = expectedCustodian && onChainCustodian &&
      expectedCustodian === onChainCustodian;

    report.verifications.push({
      check: 'CUSTODIAN_INTEGRITY',
      status: custodianMatch ? 'CUSTODIAN_MATCH' : 'CUSTODIAN_DRIFT',
      dbValue: asset.owner?.walletAddress || null,
      onChainValue: onChain.custodian,
      description: custodianMatch
        ? 'Current custodian wallet in PostgreSQL matches on-chain custodian'
        : 'ALERT: Custodian wallet in PostgreSQL does NOT match on-chain custodian — potential unauthorized custody change detected',
    });

    // --- Check 3: Classification tier ---
    const tierMatch = Number(onChain.classificationTier) === asset.classificationTier;
    report.verifications.push({
      check: 'CLASSIFICATION_INTEGRITY',
      status: tierMatch ? 'TIER_MATCH' : 'TIER_DRIFT',
      dbValue: asset.classificationTier,
      onChainValue: Number(onChain.classificationTier),
      description: tierMatch
        ? 'Classification tier in PostgreSQL matches on-chain value'
        : 'ALERT: Classification tier mismatch detected — DB may have been modified',
    });

    // Overall verdict
    const allPassed = report.verifications.every((v) =>
      ['CID_MATCH', 'CUSTODIAN_MATCH', 'TIER_MATCH'].includes(v.status)
    );
    report.verdict = allPassed ? 'INTEGRITY_OK' : 'INTEGRITY_COMPROMISED';

    return report;
  },

  /**
   * Verify an employee identity's integrity:
   * 1. Load user from PostgreSQL (identityHash, identitySalt, dossierCid,
   *    clearance, revocation state).
   * 2. Read the identity straight from the IdentityRegistry contract.
   * 3. Fetch and decrypt the IPFS dossier and recompute
   *    keccak256(externalId, fullName, sbu, salt).
   * 4. Compare every database value with its independent source.
   *
   * The on-chain reads run whether or not IPFS answers, so a forged clearance
   * is still caught when the dossier gateway is down.
   */
  async verifyIdentityIntegrity(employeeId) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    // Accept either the internal UUID or externalId (BEL employee code)
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: employeeId }, { externalId: employeeId }] },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        walletAddress: true,
        identityHash: true,
        identitySalt: true,
        dossierCid: true,
        sbu: true,
        clearanceLevel: true,
        revokedAt: true,
      },
    });

    if (!user) throw new ApiError(404, 'Employee identity not found');

    const report = {
      employeeId: user.id,
      externalId: user.externalId,
      displayName: user.displayName,
      walletAddress: user.walletAddress,
      checkedAt: new Date().toISOString(),
      ipfsAvailable: false,
      verifications: [],
    };

    // --- On-chain identity (source of truth for clearance, SBU and status) ---
    const onChain = await chainService.verifyIdentityOnChain({
      walletAddress: user.walletAddress,
      identityHash: user.identityHash,
    });

    // --- IPFS dossier: recompute the identity hash from the decrypted PII ---
    let fetchFailed = false;
    let dossier = null;
    if (!user.dossierCid) {
      report.verifications.push({
        check: 'DOSSIER_CID',
        status: 'SKIPPED',
        reason: 'No dossierCid stored for this identity — registered before IPFS integration',
      });
    } else {
      try {
        const gateway = config.pinataGateway || 'https://gateway.pinata.cloud/ipfs';
        const response = await fetch(`${gateway}/${user.dossierCid}`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`IPFS gateway returned ${response.status}`);
        dossier = decryptDossier(await response.json());
        report.ipfsAvailable = true;
      } catch (err) {
        fetchFailed = true;
        report.verifications.push({
          check: 'IPFS_DOSSIER_FETCH',
          status: 'FETCH_ERROR',
          reason: `Failed to fetch or decrypt dossier from IPFS: ${err.message}`,
        });
      }
    }

    if (dossier) {
      let recomputedHash = null;
      try {
        recomputedHash = computeIdentityHash({
          externalId: dossier.externalId,
          fullName: dossier.fullName,
          sbu: dossier.sbu,
          salt: user.identitySalt,
        });
      } catch (err) {
        fetchFailed = true;
        report.verifications.push({
          check: 'IDENTITY_HASH_RECOMPUTE',
          status: 'COMPUTE_ERROR',
          reason: `Failed to recompute identity hash: ${err.message}`,
        });
      }

      if (recomputedHash) {
        const hashMatch = recomputedHash === user.identityHash;
        report.verifications.push({
          check: 'IDENTITY_HASH_INTEGRITY',
          status: hashMatch ? 'HASH_MATCH' : 'HASH_DRIFT',
          storedHash: user.identityHash,
          recomputedHash,
          description: hashMatch
            ? 'Recomputed keccak256(externalId, fullName, sbu, salt) matches stored identityHash'
            : 'ALERT: Recomputed identity hash does NOT match stored hash — PII dossier or DB record may have been tampered with',
        });
      }

      // SBU cross-check: dossier SBU vs DB SBU
      const sbuMatch = dossier.sbu === user.sbu;
      report.verifications.push({
        check: 'SBU_INTEGRITY',
        status: sbuMatch ? 'SBU_MATCH' : 'SBU_DRIFT',
        dbValue: user.sbu,
        dossierValue: dossier.sbu,
        description: sbuMatch
          ? 'SBU in PostgreSQL matches SBU encrypted in IPFS dossier'
          : 'ALERT: SBU in PostgreSQL does NOT match dossier — potential privilege escalation detected',
      });
    }

    // --- Independent on-chain checks ---
    if (onChain.error) {
      report.verifications.push({
        check: 'ON_CHAIN_IDENTITY_REGISTRY',
        status: 'SKIPPED',
        reason: onChain.error,
      });
    } else {
      const dbState = user.revokedAt ? 'REVOKED' : 'ACTIVE';
      const chainState = onChain.isActive ? 'ACTIVE' : 'REVOKED';
      const statusMatch = dbState === chainState;
      report.verifications.push({
        check: 'ON_CHAIN_STATUS',
        status: statusMatch ? 'STATUS_MATCH' : 'STATUS_DRIFT',
        dbValue: dbState,
        onChainValue: chainState,
        description: statusMatch
          ? `Identity is ${chainState.toLowerCase()} in both PostgreSQL and the IdentityRegistry`
          : 'ALERT: PostgreSQL and the IdentityRegistry disagree on whether this identity is active — a revocation or reinstatement was bypassed',
      });

      const clearanceMatch = Number(user.clearanceLevel) === Number(onChain.clearanceLevel);
      report.verifications.push({
        check: 'CLEARANCE_INTEGRITY',
        status: clearanceMatch ? 'CLEARANCE_MATCH' : 'CLEARANCE_DRIFT',
        dbValue: user.clearanceLevel,
        onChainValue: onChain.clearanceLevel,
        description: clearanceMatch
          ? 'Clearance level in PostgreSQL matches the IdentityRegistry'
          : 'ALERT: Clearance level in PostgreSQL does NOT match the IdentityRegistry — privilege escalation in the database detected',
      });

      const sbuOnChainMatch = user.sbu === onChain.sbuCode;
      report.verifications.push({
        check: 'ON_CHAIN_SBU',
        status: sbuOnChainMatch ? 'ON_CHAIN_SBU_MATCH' : 'ON_CHAIN_SBU_DRIFT',
        dbValue: user.sbu,
        onChainValue: onChain.sbuCode,
        description: sbuOnChainMatch
          ? 'SBU in PostgreSQL matches the IdentityRegistry'
          : 'ALERT: SBU in PostgreSQL does NOT match the IdentityRegistry — potential cross-unit escalation detected',
      });

      // verifyIdentity() is false for any inactive record, so the hash check
      // only means something while the identity is active on-chain.
      if (onChain.isActive) {
        report.verifications.push(
          onChain.verified
            ? {
                check: 'ON_CHAIN_IDENTITY_REGISTRY',
                status: 'ON_CHAIN_HASH_MATCH',
                onChainClearance: onChain.clearanceLevel,
                onChainSbu: onChain.sbuCode,
                description: 'Identity hash and clearance confirmed on Ethereum Sepolia IdentityRegistry',
              }
            : {
                check: 'ON_CHAIN_IDENTITY_REGISTRY',
                status: 'ON_CHAIN_HASH_DRIFT',
                description: 'ALERT: Identity hash in DB does NOT match on-chain IdentityRegistry hash',
              }
        );
      }
    }

    const compromised = report.verifications.some((v) => IDENTITY_DRIFT_STATUSES.has(v.status));
    if (compromised) report.verdict = 'INTEGRITY_COMPROMISED';
    else if (fetchFailed) report.verdict = 'VERIFICATION_ERROR';
    else if (!user.dossierCid) report.verdict = 'PARTIAL';
    else report.verdict = 'INTEGRITY_OK';

    return report;
  },

  /**
   * DEMO ONLY: play the rogue insider. Rewrites one security-relevant value
   * directly in the PostgreSQL cache, bypassing the application layer and the
   * chain, so the audit check has a real discrepancy to catch. The forged value
   * is deliberately not indexed anywhere: a genuine insider would not leave a
   * trail either. Identity: clearanceLevel. Asset: classificationTier. The
   * value flips to the far end of the 1-4 scale (4 unless it is already 4).
   */
  async simulateTamper({ kind, id }, actor) {
    assertSimulationEnabled();
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    if (kind === 'identity') {
      const user = await findIdentity(id);
      const forged = user.clearanceLevel === 4 ? 1 : 4;
      await prisma.user.update({ where: { id: user.id }, data: { clearanceLevel: forged } });
      logger.warn(`[TamperLab] ${actor?.walletAddress || actor?.id} forged clearance of ${user.walletAddress} in Postgres: ${user.clearanceLevel} -> ${forged}`);
      return {
        kind,
        id: user.id,
        label: user.displayName || user.externalId || user.id,
        field: 'clearanceLevel',
        before: user.clearanceLevel,
        after: forged,
      };
    }

    const asset = await findAsset(id);
    const forged = asset.classificationTier === 4 ? 1 : 4;
    await prisma.asset.update({ where: { id: asset.id }, data: { classificationTier: forged } });
    logger.warn(`[TamperLab] ${actor?.walletAddress || actor?.id} forged classification of asset ${asset.id} in Postgres: ${asset.classificationTier} -> ${forged}`);
    return {
      kind,
      id: asset.id,
      label: asset.name,
      field: 'classificationTier',
      before: asset.classificationTier,
      after: forged,
    };
  },

  /**
   * DEMO ONLY: undo a simulated tamper by copying the chain's value back into
   * the cache. Never writes to the chain, and refuses when it cannot read the
   * chain, so it can never "restore" a guess.
   */
  async restoreFromChain({ kind, id }, actor) {
    assertSimulationEnabled();
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    if (kind === 'identity') {
      const user = await findIdentity(id);
      const onChain = await chainService.verifyIdentityOnChain({
        walletAddress: user.walletAddress,
        identityHash: user.identityHash,
      });
      if (onChain.error) throw new ApiError(502, `Could not read the identity from the chain: ${onChain.error}`);
      if (!onChain.isActive) {
        throw new ApiError(409, 'This identity is not active on-chain, so there is no clearance to restore.');
      }
      await prisma.user.update({ where: { id: user.id }, data: { clearanceLevel: onChain.clearanceLevel } });
      logger.warn(`[TamperLab] ${actor?.walletAddress || actor?.id} restored clearance of ${user.walletAddress} from chain: ${user.clearanceLevel} -> ${onChain.clearanceLevel}`);
      return {
        kind,
        id: user.id,
        label: user.displayName || user.externalId || user.id,
        field: 'clearanceLevel',
        before: user.clearanceLevel,
        after: onChain.clearanceLevel,
      };
    }

    const asset = await findAsset(id);
    if (!asset.tokenId) throw new ApiError(409, 'This asset has no on-chain token to restore from.');
    const onChain = await chainService.getAssetOnChain(asset.tokenId);
    if (!onChain.found) {
      throw new ApiError(502, onChain.error || `Token #${asset.tokenId} could not be read from the chain`);
    }
    const tier = Number(onChain.classificationTier);
    await prisma.asset.update({ where: { id: asset.id }, data: { classificationTier: tier } });
    logger.warn(`[TamperLab] ${actor?.walletAddress || actor?.id} restored classification of asset ${asset.id} from chain: ${asset.classificationTier} -> ${tier}`);
    return {
      kind,
      id: asset.id,
      label: asset.name,
      field: 'classificationTier',
      before: asset.classificationTier,
      after: tier,
    };
  },

  /**
   * Verify an arbitrary Ethereum Sepolia transaction by its tx hash.
   * Returns the transaction receipt and block data directly from the chain.
   */
  async verifyTransaction(txHash) {
    if (!provider) throw new ApiError(503, 'Blockchain provider not configured');

    try {
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(txHash),
        provider.getTransactionReceipt(txHash),
      ]);

      if (!tx) throw new ApiError(404, `Transaction ${txHash} not found on Ethereum Sepolia`);

      const block = receipt ? await provider.getBlock(receipt.blockNumber) : null;

      return {
        txHash,
        network: 'Ethereum Sepolia (chainId: 11155111)',
        found: true,
        status: receipt
          ? (receipt.status === 1 ? 'SUCCESS' : 'REVERTED')
          : 'PENDING',
        from: tx.from,
        to: tx.to,
        blockNumber: receipt?.blockNumber?.toString() || null,
        blockHash: receipt?.blockHash || null,
        blockTimestamp: block?.timestamp
          ? new Date(block.timestamp * 1000).toISOString()
          : null,
        gasUsed: receipt?.gasUsed?.toString() || null,
        logsCount: receipt?.logs?.length ?? 0,
        explorerUrl: `https://sepolia.etherscan.io/tx/${txHash}`,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(502, `Chain query failed: ${err.message}`);
    }
  },
};

export default tamperService;
