import AuditLogArtifact from '../contracts/AuditLog.json';
import IdentityRegistryArtifact from '../contracts/IdentityRegistry.json';
import AccessControlArtifact from '../contracts/AccessControl.json';
import AssetNFTArtifact from '../contracts/AssetNFT.json';

export const SEPOLIA_CONFIG = {
  chainId: 11155111,
  chainIdHex: '0xaa36a7',
  name: 'Ethereum Sepolia',
  rpcUrl: import.meta.env.VITE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  explorerUrl: 'https://sepolia.etherscan.io',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
};

/**
 * Resolve a contract address from (in priority order):
 *  1. Vite env var  — set by the developer / CI pipeline in .env
 *  2. Artifact JSON — written automatically by blockchain/scripts/deploy.js
 *
 * No hardcoded fallback: if both sources are missing the app throws at startup
 * with a clear message rather than silently pointing at a stale address.
 */
function resolveAddress(envVar, artifactAddress, contractName) {
  const resolved = envVar || artifactAddress;
  if (!resolved || resolved === '') {
    throw new Error(
      `[TrustChain] ${contractName} address is not configured.\n` +
      `Set the corresponding VITE_ env var in frontend/.env, ` +
      `or run "npm run deploy:sepolia" in the blockchain/ directory ` +
      `to regenerate the contract artifacts.`
    );
  }
  return resolved;
}

export const CONTRACT_ADDRESSES = {
  AuditLog: resolveAddress(
    import.meta.env.VITE_AUDIT_LOG_ADDRESS,
    AuditLogArtifact.address,
    'AuditLog'
  ),
  IdentityRegistry: resolveAddress(
    import.meta.env.VITE_IDENTITY_REGISTRY_ADDRESS,
    IdentityRegistryArtifact.address,
    'IdentityRegistry'
  ),
  AccessControl: resolveAddress(
    import.meta.env.VITE_ACCESS_CONTROL_ADDRESS,
    AccessControlArtifact.address,
    'AccessControl'
  ),
  AssetNFT: resolveAddress(
    import.meta.env.VITE_CONTRACT_ADDRESS,
    AssetNFTArtifact.address,
    'AssetNFT'
  ),
};

export const CONTRACT_ABIS = {
  AuditLog: AuditLogArtifact.abi || AuditLogArtifact,
  IdentityRegistry: IdentityRegistryArtifact.abi || IdentityRegistryArtifact,
  AccessControl: AccessControlArtifact.abi || AccessControlArtifact,
  AssetNFT: AssetNFTArtifact.abi || AssetNFTArtifact,
};
