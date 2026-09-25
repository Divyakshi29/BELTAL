import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import provider from '../config/blockchain.js';
import config from '../config/env.js';
import logger from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contractsDir = path.join(__dirname, '../config/contracts');

// Load ABIs
function loadAbi(name) {
  try {
    const file = path.join(contractsDir, `${name}.json`);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed.abi || parsed;
    }
  } catch (err) {
    logger.warn(`Failed to load ${name} ABI: ${err.message}`);
  }
  return null;
}

const auditLogAbi = loadAbi('AuditLog');
const identityRegistryAbi = loadAbi('IdentityRegistry');
const accessControlAbi = loadAbi('AccessControl');
const assetNftAbi = loadAbi('AssetNFT');

// App-level roles (Role enum) -> the AccessControl.sol role constants they map
// to. The contract hashes its own names (ROLE_SUPER_ADMIN, ROLE_SBU_MANAGER,
// ROLE_EMPLOYEE), so `ROLE_<APP ROLE>` would grant a hash nothing checks.
const CONTRACT_ROLE_NAMES = {
  ADMIN: 'ROLE_SUPER_ADMIN',
  MANAGER: 'ROLE_SBU_MANAGER',
  AUDITOR: 'ROLE_AUDITOR',
  USER: 'ROLE_EMPLOYEE',
  SYSTEM_CONNECTOR: 'ROLE_SYSTEM_CONNECTOR',
};

function isConfigured() {
  return Boolean(provider && config.contractAddress && assetNftAbi);
}

function getSigner() {
  if (!config.deployerPrivateKey || !provider) return null;
  try {
    const pk = config.deployerPrivateKey.trim();
    const formatted = pk.startsWith('0x') ? pk : `0x${pk}`;
    return new ethers.Wallet(formatted, provider);
  } catch {
    return null;
  }
}

/**
 * Custodial signer for the ROLE_SYSTEM_CONNECTOR machine identity (issue
 * #74) — a separate key from the admin deployer signer above, so automated
 * PACS/HRMS-submitted transactions are attributable to the machine identity
 * on-chain rather than the human admin service key. Falls back to the admin
 * deployer signer (with a warning) when SYSTEM_CONNECTOR_PRIVATE_KEY isn't
 * configured, so dev/demo environments without it don't crash.
 */
function getSystemConnectorSigner() {
  if (!provider) return null;
  if (!config.systemConnectorPrivateKey) {
    logger.warn(
      'SYSTEM_CONNECTOR_PRIVATE_KEY not set — falling back to the admin deployer signer for machine-submitted (PACS/HRMS) transactions. Set a dedicated key before production use (issue #74).'
    );
    return getSigner();
  }
  try {
    const pk = config.systemConnectorPrivateKey.trim();
    const formatted = pk.startsWith('0x') ? pk : `0x${pk}`;
    return new ethers.Wallet(formatted, provider);
  } catch {
    return null;
  }
}

function getContract(address, abi, withSigner = true) {
  if (!address || !abi || !provider) return null;
  const signerOrProvider = withSigner ? (getSigner() || provider) : provider;
  return new ethers.Contract(address, abi, signerOrProvider);
}

function getContractWithSigner(address, abi, signer) {
  if (!address || !abi || !signer) return null;
  return new ethers.Contract(address, abi, signer);
}

export const chainService = {
  isConfigured,

  getAuditLogContract(withSigner = true) {
    return getContract(config.auditLogAddress, auditLogAbi, withSigner);
  },

  getIdentityContract(withSigner = true) {
    return getContract(config.identityRegistryAddress, identityRegistryAbi, withSigner);
  },

  getAccessControlContract(withSigner = true) {
    return getContract(config.accessControlAddress, accessControlAbi, withSigner);
  },

  getAssetContract(withSigner = true) {
    return getContract(config.contractAddress || config.assetNftAddress, assetNftAbi, withSigner);
  },

  /**
   * Register employee DID and cryptographic hash on-chain (Issue #87)
   */
  async registerIdentityOnChain({ walletAddress, did, identityHash, clearanceLevel, sbu }) {
    const contract = this.getIdentityContract(true);
    if (!contract) {
      logger.warn(`On-chain identity registration skipped for ${walletAddress} — IdentityRegistry contract not configured.`);
      return { txHash: null, blockNumber: null, confirmed: false };
    }

    try {
      // Check if already active on-chain before submitting
      try {
        const existing = await contract.getIdentity(walletAddress);
        if (existing && existing.isActive) {
          logger.info(`Identity for ${walletAddress} is already registered and active on Ethereum Sepolia.`);
          return { txHash: null, blockNumber: null, confirmed: true, alreadyRegistered: true };
        }
      } catch (_) {
        // Proceed with registration if check errors
      }

      const formattedHash = identityHash.startsWith('0x') ? identityHash : `0x${identityHash}`;
      const sbuBytes32 = ethers.encodeBytes32String((sbu || 'SBU_RADAR').slice(0, 31));
      const employeeDid = did || `did:beltal:${walletAddress.toLowerCase()}`;

      const tx = await contract.registerIdentity(
        walletAddress,
        employeeDid,
        formattedHash,
        clearanceLevel || 1,
        sbuBytes32
      );
      const receipt = await tx.wait();

      logger.info(`Identity registered on Ethereum Sepolia for ${walletAddress}, Tx: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        confirmed: true,
      };
    } catch (err) {
      // If error indicates it was already registered (e.g. from a previous mined tx), verify and handle gracefully
      if (err.message && (err.message.includes('Identity already registered') || err.message.includes('already registered'))) {
        try {
          const existing = await contract.getIdentity(walletAddress);
          if (existing && existing.isActive) {
            logger.info(`Identity for ${walletAddress} confirmed active on-chain after revert.`);
            return { txHash: null, blockNumber: null, confirmed: true, alreadyRegistered: true };
          }
        } catch (_) {}
      }

      logger.error(`On-chain identity registration failed: ${err.message}`);
      return { txHash: null, blockNumber: null, confirmed: false, error: err.message };
    }
  },

  /**
   * Grant the AccessControl role that an app-level role maps to. grantRole only
   * sets a flag, so repeating it is harmless: updateRole relies on that to
   * finish a grant that failed right after registerIdentityOnChain.
   */
  async grantRoleOnChain({ walletAddress, role }) {
    const contract = this.getAccessControlContract(true);
    if (!contract) {
      logger.warn(`On-chain role grant skipped for ${walletAddress} — AccessControl contract not configured.`);
      return { txHash: null, blockNumber: null, confirmed: false };
    }

    try {
      const contractRole = CONTRACT_ROLE_NAMES[String(role).toUpperCase()];
      if (!contractRole) throw new Error(`No on-chain role mapping for ${role}`);
      const roleBytes32 = ethers.keccak256(ethers.toUtf8Bytes(contractRole));
      const tx = await contract.grantRole(roleBytes32, walletAddress);
      const receipt = await tx.wait();

      logger.info(`Role ${role} granted on Ethereum Sepolia to ${walletAddress}, Tx: ${receipt.hash}`);
      return { txHash: receipt.hash, blockNumber: receipt.blockNumber, confirmed: true };
    } catch (err) {
      logger.error(`On-chain role grant failed: ${err.message}`);
      return { txHash: null, blockNumber: null, confirmed: false, error: err.message };
    }
  },

  /**
   * Strip the AccessControl role an app-level role maps to. Revoking an
   * identity deactivates it in IdentityRegistry, but role checks
   * (AssetNFT mint/transfer authorisation, admin-only setters) read
   * AccessControl.hasRole, so a revoked wallet keeps its powers on-chain until
   * the role is removed too. revokeRole only clears a flag, so repeating it is
   * harmless.
   */
  async revokeRoleOnChain({ walletAddress, role }) {
    const contract = this.getAccessControlContract(true);
    if (!contract) {
      logger.warn(`On-chain role revoke skipped for ${walletAddress} — AccessControl contract not configured.`);
      return { txHash: null, blockNumber: null, confirmed: false };
    }

    try {
      const contractRole = CONTRACT_ROLE_NAMES[String(role).toUpperCase()];
      if (!contractRole) throw new Error(`No on-chain role mapping for ${role}`);
      const roleBytes32 = ethers.keccak256(ethers.toUtf8Bytes(contractRole));
      const tx = await contract.revokeRole(roleBytes32, walletAddress);
      const receipt = await tx.wait();

      logger.info(`Role ${role} revoked on Ethereum Sepolia from ${walletAddress}, Tx: ${receipt.hash}`);
      return { txHash: receipt.hash, blockNumber: receipt.blockNumber, confirmed: true };
    } catch (err) {
      logger.error(`On-chain role revoke failed: ${err.message}`);
      return { txHash: null, blockNumber: null, confirmed: false, error: err.message };
    }
  },

  /**
   * Batch register employee identities on-chain (supports up to 250 records)
   */
  async batchRegisterIdentitiesOnChain({ users, dids, hashes, clearances, sbus }) {
    const contract = this.getIdentityContract(true);
    if (!contract) {
      return { confirmed: false, error: 'IdentityRegistry contract not configured' };
    }

    try {
      const formattedHashes = hashes.map((h) => (h.startsWith('0x') ? h : `0x${h}`));
      const formattedSbus = sbus.map((s) => ethers.encodeBytes32String((s || 'SBU_RADAR').slice(0, 31)));

      const tx = await contract.batchRegisterIdentities(
        users,
        dids,
        formattedHashes,
        clearances,
        formattedSbus
      );
      const receipt = await tx.wait();

      logger.info(`Batch registered ${users.length} identities on Sepolia, Tx: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        confirmed: true,
        count: users.length,
      };
    } catch (err) {
      logger.error(`Batch identity registration failed: ${err.message}`);
      return { confirmed: false, error: err.message };
    }
  },

  /**
   * Revoke (quarantine) an identity on-chain. Used by guardian recovery to
   * retire the lost wallet before the same DID is re-anchored to a new one,
   * and available for straightforward revocation too.
   */
  async revokeIdentityOnChain({ walletAddress, reason }) {
    const contract = this.getIdentityContract(true);
    if (!contract) {
      return { confirmed: false, error: 'IdentityRegistry contract not configured' };
    }

    try {
      const tx = await contract.revokeIdentity(walletAddress, reason || 'Revoked by administrator');
      const receipt = await tx.wait();
      logger.info(`Identity ${walletAddress} revoked on Sepolia, Tx: ${receipt.hash}`);
      return { txHash: receipt.hash, blockNumber: receipt.blockNumber, confirmed: true };
    } catch (err) {
      logger.error(`On-chain identity revocation failed: ${err.message}`);
      return { confirmed: false, error: err.message };
    }
  },

  /**
   * Update clearance level on-chain (Issue #87)
   */
  async assignRoleOnChain({ walletAddress, role, previousRole, clearanceLevel }) {
    const identityContract = this.getIdentityContract(true);
    const accessContract = this.getAccessControlContract(true);

    if (!identityContract && !accessContract) {
      logger.warn(`On-chain role/clearance assignment skipped for ${walletAddress} — contracts not configured.`);
      return { txHash: null, blockNumber: null, confirmed: false };
    }

    let roleGranted = false;
    try {
      let txHash = null;
      let blockNumber = null;

      if (clearanceLevel && identityContract) {
        const tx = await identityContract.updateClearance(walletAddress, clearanceLevel);
        const receipt = await tx.wait();
        txHash = receipt.hash;
        blockNumber = receipt.blockNumber;
      }

      if (role && accessContract) {
        const contractRole = CONTRACT_ROLE_NAMES[String(role).toUpperCase()];
        if (!contractRole) throw new Error(`No on-chain role mapping for ${role}`);
        const roleBytes32 = ethers.keccak256(ethers.toUtf8Bytes(contractRole));
        const tx2 = await accessContract.grantRole(roleBytes32, walletAddress);
        const receipt2 = await tx2.wait();
        txHash = receipt2.hash;
        blockNumber = receipt2.blockNumber;
        roleGranted = true;

        // Grant first, then revoke, so a failed revoke never leaves the wallet role-less.
        const oldContractRole = previousRole && previousRole !== role
          ? CONTRACT_ROLE_NAMES[String(previousRole).toUpperCase()]
          : null;
        if (oldContractRole) {
          const oldRoleBytes32 = ethers.keccak256(ethers.toUtf8Bytes(oldContractRole));
          const tx3 = await accessContract.revokeRole(oldRoleBytes32, walletAddress);
          const receipt3 = await tx3.wait();
          txHash = receipt3.hash;
          blockNumber = receipt3.blockNumber;
        }
      }

      return { txHash, blockNumber, confirmed: true, roleGranted };
    } catch (err) {
      logger.error(`On-chain role/clearance update failed: ${err.message}`);
      return { txHash: null, blockNumber: null, confirmed: false, roleGranted, error: err.message };
    }
  },

  /**
   * Verify identity hash on-chain (Issue #87)
   */
  async verifyIdentityOnChain({ walletAddress, identityHash }) {
    const contract = this.getIdentityContract(false);
    if (!contract) {
      return { verified: false, error: 'IdentityRegistry contract not configured' };
    }

    try {
      const formattedHash = identityHash.startsWith('0x') ? identityHash : `0x${identityHash}`;
      const isMatch = await contract.verifyIdentity(walletAddress, formattedHash);
      const identity = await contract.getIdentity(walletAddress);

      return {
        verified: isMatch,
        isActive: identity.isActive,
        clearanceLevel: Number(identity.clearanceLevel),
        sbuCode: ethers.decodeBytes32String(identity.sbuCode),
        registeredAt: new Date(Number(identity.registeredAt) * 1000).toISOString(),
      };
    } catch (err) {
      return { verified: false, error: err.message };
    }
  },

  /**
   * Check physical access control zone gate on-chain (Issue #88)
   */
  async canAccessZoneOnChain({ walletAddress, zoneId }) {
    const contract = this.getAccessControlContract(false);
    if (!contract) {
      return { allowed: false, reason: 'AccessControl contract not configured' };
    }

    try {
      const zoneBytes32 = ethers.encodeBytes32String(zoneId.slice(0, 31));
      const [allowed, reason] = await contract.canAccessZone(walletAddress, zoneBytes32);
      return { allowed, reason };
    } catch (err) {
      return { allowed: false, reason: err.message };
    }
  },

  /**
   * Admin: create or update a facility zone on-chain via AccessControl.createZone.
   * A null/omitted `sbu` maps to the contract's "ALL" (any SBU) sentinel. Note
   * the contract resets the zone's lockdown flag when it is (re)configured.
   */
  async configureZoneOnChain({ zoneId, requiredClearance, sbu }) {
    const contract = this.getAccessControlContract(true);
    if (!contract) {
      logger.warn(`On-chain zone configuration skipped for zone ${zoneId} — AccessControl contract not configured.`);
      return { txHash: null, blockNumber: null, confirmed: false };
    }

    try {
      const zoneBytes32 = ethers.encodeBytes32String(zoneId.slice(0, 31));
      const sbuBytes32 = ethers.encodeBytes32String(sbu ? sbu.slice(0, 31) : 'ALL');
      const tx = await contract.createZone(zoneBytes32, requiredClearance, sbuBytes32);
      const receipt = await tx.wait();

      logger.info(`Zone ${zoneId} configured on Ethereum Sepolia (clearance ${requiredClearance}, SBU ${sbu || 'ALL'}), Tx: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        confirmed: true,
      };
    } catch (err) {
      logger.error(`On-chain zone configuration failed: ${err.message}`);
      return { txHash: null, blockNumber: null, confirmed: false, error: err.message };
    }
  },

  /**
   * Admin: flip a facility zone's emergency lockdown flag on-chain (Issue #76).
   * A locked zone denies all canAccessZone() checks regardless of clearance/SBU.
   */
  async toggleEmergencyLockdownOnChain({ zoneId, status }) {
    const contract = this.getAccessControlContract(true);
    if (!contract) {
      logger.warn(`On-chain emergency lockdown toggle skipped for zone ${zoneId} — AccessControl contract not configured.`);
      return { txHash: null, blockNumber: null, confirmed: false };
    }

    try {
      const zoneBytes32 = ethers.encodeBytes32String(zoneId.slice(0, 31));
      const tx = await contract.toggleEmergencyLockdown(zoneBytes32, status);
      const receipt = await tx.wait();

      logger.info(`Zone ${zoneId} emergency lockdown ${status ? 'ENABLED' : 'DISABLED'} on Ethereum Sepolia, Tx: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        confirmed: true,
      };
    } catch (err) {
      logger.error(`On-chain emergency lockdown toggle failed: ${err.message}`);
      return { txHash: null, blockNumber: null, confirmed: false, error: err.message };
    }
  },

  /**
   * Mint defence hardware soulbound custody NFT (Issue #89)
   */
  async mintAssetOnChain({ custodianWallet, assetTag, serialNumber, classificationTier, sbu, ipfsCid }) {
    const contract = this.getAssetContract(true);
    if (!contract) {
      logger.warn(`On-chain asset minting skipped for ${custodianWallet} (${assetTag}) — AssetNFT contract not configured.`);
      return { txHash: null, blockNumber: null, tokenId: null, confirmed: false };
    }

    try {
      const sbuBytes32 = ethers.encodeBytes32String((sbu || 'SBU_RADAR').slice(0, 31));
      const tx = await contract.mintAssetDetailed(
        custodianWallet,
        assetTag || 'BEL-ASSET',
        serialNumber || '',
        classificationTier,
        sbuBytes32,
        `ipfs://${ipfsCid || ''}`
      );
      const receipt = await tx.wait();

      let tokenId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === 'AssetMinted') {
            tokenId = parsed.args.tokenId.toString();
            break;
          }
        } catch {
          // ignore unparsed logs
        }
      }

      logger.info(`Asset minted on Ethereum Sepolia: Token #${tokenId}, Tx: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        tokenId,
        confirmed: true,
      };
    } catch (err) {
      logger.error(`On-chain asset minting failed: ${err.message}`);
      return { txHash: null, blockNumber: null, tokenId: null, confirmed: false, error: err.message };
    }
  },

  /**
   * Reassign soulbound asset custody on-chain with EIP-712 typed-data signature (Issue #100).
   *
   * The function supports two signing paths:
   *   (a) `signature` is provided pre-built (e.g. custodian signed via MetaMask on the frontend).
   *   (b) `custodianPrivateKey` is provided — the backend builds and signs the EIP-712 payload
   *       server-side (automated / test scenarios).
   *
   * If neither `signature` nor `custodianPrivateKey` is provided the call falls back to the
   * admin-bypass `reassignCustody()` function (no EIP-712 check, onlyAuthorized gate only).
   * This path is intentional for emergency admin reassignments; it is clearly attributed in
   * the on-chain CustodyRecord (empty signature) and the AuditLog.
   *
   * @param {object} params
   * @param {string}  params.tokenId                 - On-chain token ID (string or bigint)
   * @param {string}  params.newCustodianWallet       - New custodian Ethereum address
   * @param {string}  [params.reason]                 - Human-readable reason stored on-chain
   * @param {string}  [params.signature]              - Pre-built 65-byte hex EIP-712 signature
   * @param {string}  [params.custodianPrivateKey]    - Raw hex private key to sign server-side
   * @param {number}  [params.deadline]               - Unix timestamp (default: now + 1 hour)
   */
  async reassignCustodyOnChain({ tokenId, newCustodianWallet, reason, signature, custodianPrivateKey, deadline }) {
    const contract = this.getAssetContract(true);
    if (!contract || !tokenId) {
      logger.warn(`On-chain custody reassignment skipped for token #${tokenId} — contract not present.`);
      return { txHash: null, blockNumber: null, confirmed: false };
    }

    try {
      // If no custodian signature is available, fall back to the admin-bypass path
      // (reassignCustody — no EIP-712 check, onlyAuthorized only).
      if (!signature && !custodianPrivateKey) {
        logger.warn(
          `reassignCustodyOnChain: no custodian signature or private key supplied for token #${tokenId} — ` +
          `falling back to admin-bypass reassignCustody(). ` +
          `This will store an empty signature in custodyHistory (bypass marker).`
        );
        const tx = await contract.reassignCustody(
          BigInt(tokenId),
          newCustodianWallet,
          reason || 'ADMIN_BYPASS_HANDOVER'
        );
        const receipt = await tx.wait();
        logger.info(`Custody admin-bypassed on Sepolia: Token #${tokenId} -> ${newCustodianWallet}, Tx: ${receipt.hash}`);
        return { txHash: receipt.hash, blockNumber: receipt.blockNumber, confirmed: true };
      }

      // Determine the effective deadline (default: 1 hour from now)
      const effectiveDeadline = deadline ?? (Math.floor(Date.now() / 1000) + 3600);

      // If a pre-built signature is not already provided, build and sign it server-side
      if (!signature) {
        // Read the deployment chain and contract address for the EIP-712 domain
        const network = await contract.runner.provider.getNetwork();
        const chainId = Number(network.chainId);
        const assetNFTAddress = await contract.getAddress();

        // Read the current on-chain nonce for this token (replay-prevention)
        const nonce = await contract.custodyNonces(BigInt(tokenId));

        // Build the custodian signer from the provided raw private key
        const custodianSigner = new ethers.Wallet(
          custodianPrivateKey.startsWith('0x') ? custodianPrivateKey : `0x${custodianPrivateKey}`,
          contract.runner.provider
        );

        // EIP-712 domain matching the contract constructor
        const domain = {
          name: 'TrustChain BEL Defence Asset',
          version: '1',
          chainId,
          verifyingContract: assetNFTAddress,
        };

        // CustodyTransfer typed data struct
        const types = {
          CustodyTransfer: [
            { name: 'tokenId',  type: 'uint256' },
            { name: 'from',     type: 'address' },
            { name: 'to',       type: 'address' },
            { name: 'nonce',    type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        };

        const value = {
          tokenId: BigInt(tokenId),
          from: custodianSigner.address,
          to: newCustodianWallet,
          nonce,
          deadline: BigInt(effectiveDeadline),
        };

        signature = await custodianSigner.signTypedData(domain, types, value);
        logger.info(`EIP-712 CustodyTransfer signed by ${custodianSigner.address} for token #${tokenId}`);
      }

      // Call the full verification path: transferCustody(tokenId, newCustodian, reason, deadline, sig)
      const tx = await contract.transferCustody(
        BigInt(tokenId),
        newCustodianWallet,
        reason || 'AUTHORIZED_HANDOVER',
        BigInt(effectiveDeadline),
        signature
      );
      const receipt = await tx.wait();

      logger.info(`Custody reassigned on Ethereum Sepolia: Token #${tokenId} -> ${newCustodianWallet}, Tx: ${receipt.hash}`);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        confirmed: true,
      };
    } catch (err) {
      logger.error(`On-chain custody reassignment failed: ${err.message}`);
      return { txHash: null, blockNumber: null, confirmed: false, error: err.message };
    }
  },


  /**
   * Read-only view call: fetch on-chain asset details and current custodian
   */
  async getAssetOnChain(tokenId) {
    const contract = this.getAssetContract(false);
    if (!contract) {
      return { found: false, error: 'Contract not configured' };
    }

    try {
      const [details, custodian] = await Promise.all([
        contract.getAssetDetails(BigInt(tokenId)),
        contract.getCustodian(BigInt(tokenId)),
      ]);

      return {
        found: true,
        tokenId: tokenId.toString(),
        assetTag: details.assetTag,
        serialNumber: details.serialNumber,
        classificationTier: Number(details.classificationTier),
        sbu: ethers.decodeBytes32String(details.sbu),
        tokenURI: details.tokenURI,
        mintedAt: new Date(Number(details.mintedAt) * 1000).toISOString(),
        isUnderMaintenance: details.isUnderMaintenance,
        custodian,
      };
    } catch (err) {
      return { found: false, error: err.message };
    }
  },

  /**
   * Log arbitrary security event directly into AuditLog.sol (Issue #86).
   * Pass `asSystemConnector: true` (issue #74) to sign with the dedicated
   * machine-identity custodial wallet instead of the admin deployer key —
   * used by automated PACS/HRMS ingest so the resulting on-chain event (and
   * the indexed AuditEvent it produces) is attributable to the machine
   * identity, not a human admin.
   */
  async logAuditEventOnChain({ eventType, actor, target, entityId, details, asSystemConnector = false }) {
    const contract = asSystemConnector
      ? getContractWithSigner(config.auditLogAddress, auditLogAbi, getSystemConnectorSigner())
      : this.getAuditLogContract(true);
    if (!contract) return { confirmed: false, error: 'AuditLog contract not configured' };

    try {
      const eventTypeBytes32 = ethers.encodeBytes32String((eventType || 'SECURITY_EVENT').slice(0, 31));
      const entityIdBytes32 = entityId ? (entityId.startsWith('0x') ? entityId : ethers.encodeBytes32String(entityId.slice(0, 31))) : ethers.ZeroHash;

      const tx = await contract.logEvent(
        eventTypeBytes32,
        actor || ethers.ZeroAddress,
        target || ethers.ZeroAddress,
        entityIdBytes32,
        details || ''
      );
      const receipt = await tx.wait();

      return { txHash: receipt.hash, blockNumber: receipt.blockNumber, confirmed: true };
    } catch (err) {
      logger.error(`On-chain audit logging failed: ${err.message}`);
      return { confirmed: false, error: err.message };
    }
  },
};

export default chainService;
