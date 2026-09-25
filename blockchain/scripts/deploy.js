const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  console.log('================================================================');
  console.log(`TrustChain (BELTAL) - Smart Contract Deployment Pipeline`);
  console.log(`Network: ${network} (Chain ID: ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deployer Balance: ${hre.ethers.formatEther(balance)} ETH`);
  console.log('================================================================\n');

  // 1. Deploy AuditLog.sol
  console.log('[1/4] Deploying AuditLog.sol...');
  const AuditLogFactory = await hre.ethers.getContractFactory('AuditLog');
  const auditLog = await AuditLogFactory.deploy(deployer.address);
  await auditLog.waitForDeployment();
  const auditLogAddress = await auditLog.getAddress();
  console.log(`  ✓ AuditLog deployed at: ${auditLogAddress}`);

  // 2. Deploy IdentityRegistry.sol
  console.log('\n[2/4] Deploying IdentityRegistry.sol...');
  const IdentityRegistryFactory = await hre.ethers.getContractFactory('IdentityRegistry');
  const identityRegistry = await IdentityRegistryFactory.deploy(deployer.address, auditLogAddress);
  await identityRegistry.waitForDeployment();
  const identityRegistryAddress = await identityRegistry.getAddress();
  console.log(`  ✓ IdentityRegistry deployed at: ${identityRegistryAddress}`);

  // 3. Deploy AccessControl.sol
  console.log('\n[3/4] Deploying AccessControl.sol...');
  const AccessControlFactory = await hre.ethers.getContractFactory('AccessControl');
  const accessControl = await AccessControlFactory.deploy(deployer.address, auditLogAddress, identityRegistryAddress);
  await accessControl.waitForDeployment();
  const accessControlAddress = await accessControl.getAddress();
  console.log(`  ✓ AccessControl deployed at: ${accessControlAddress}`);

  // 4. Deploy AssetNFT.sol
  console.log('\n[4/4] Deploying AssetNFT.sol...');
  const AssetNFTFactory = await hre.ethers.getContractFactory('AssetNFT');
  const assetNFT = await AssetNFTFactory.deploy(
    deployer.address,
    auditLogAddress,
    identityRegistryAddress,
    accessControlAddress
  );
  await assetNFT.waitForDeployment();
  const assetNFTAddress = await assetNFT.getAddress();
  console.log(`  ✓ AssetNFT deployed at: ${assetNFTAddress}`);

  // 5. Cross-Contract Authorization & Allowlist Wiring
  console.log('\n[Wiring] Setting up cross-contract permissions...');

  console.log('  -> Authorizing IdentityRegistry on AuditLog...');
  let tx = await auditLog.setAuthorizedCaller(identityRegistryAddress, true);
  await tx.wait();

  console.log('  -> Authorizing AccessControl on AuditLog...');
  tx = await auditLog.setAuthorizedCaller(accessControlAddress, true);
  await tx.wait();

  console.log('  -> Authorizing AssetNFT on AuditLog...');
  tx = await auditLog.setAuthorizedCaller(assetNFTAddress, true);
  await tx.wait();

  console.log('  -> Authorizing AccessControl on IdentityRegistry...');
  tx = await identityRegistry.setAuthorizedCaller(accessControlAddress, true);
  await tx.wait();

  console.log('  -> Authorizing AssetNFT on IdentityRegistry...');
  tx = await identityRegistry.setAuthorizedCaller(assetNFTAddress, true);
  await tx.wait();

  console.log('  ✓ All cross-contract authorizations wired successfully!\n');

  // 6. Extract ABIs & Bytecode Artifacts
  const contractsInfo = {
    AuditLog: {
      address: auditLogAddress,
      abi: JSON.parse(AuditLogFactory.interface.formatJson()),
    },
    IdentityRegistry: {
      address: identityRegistryAddress,
      abi: JSON.parse(IdentityRegistryFactory.interface.formatJson()),
    },
    AccessControl: {
      address: accessControlAddress,
      abi: JSON.parse(AccessControlFactory.interface.formatJson()),
    },
    AssetNFT: {
      address: assetNFTAddress,
      abi: JSON.parse(AssetNFTFactory.interface.formatJson()),
    },
  };

  // 7. Save Deployment Manifest
  // Fetch the block number at which the final contract (AssetNFT) was deployed
  // so the backend indexer can use it as INDEXER_FROM_BLOCK for fresh backfill.
  const deploymentReceipt = await hre.ethers.provider.getTransactionReceipt(assetNFT.deploymentTransaction().hash);
  const deploymentBlock = deploymentReceipt ? Number(deploymentReceipt.blockNumber) : null;

  const deploymentManifest = {
    network,
    chainId: Number(chainId),
    deployedAt: new Date().toISOString(),
    deploymentBlock,
    deployer: deployer.address,
    contracts: {
      AuditLog: {
        address: auditLogAddress,
        etherscan: network === 'sepolia' ? `https://sepolia.etherscan.io/address/${auditLogAddress}` : null,
      },
      IdentityRegistry: {
        address: identityRegistryAddress,
        etherscan: network === 'sepolia' ? `https://sepolia.etherscan.io/address/${identityRegistryAddress}` : null,
      },
      AccessControl: {
        address: accessControlAddress,
        etherscan: network === 'sepolia' ? `https://sepolia.etherscan.io/address/${accessControlAddress}` : null,
      },
      AssetNFT: {
        address: assetNFTAddress,
        etherscan: network === 'sepolia' ? `https://sepolia.etherscan.io/address/${assetNFTAddress}` : null,
      },
    },
  };

  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(deploymentsDir, `${network}.json`),
    JSON.stringify(deploymentManifest, null, 2)
  );
  console.log(`Saved deployment manifest to: blockchain/deployments/${network}.json`);


  // 8. Synchronize Contract Artifacts to Backend and Frontend
  const backendContractsDir = path.join(__dirname, '../../backend/src/config/contracts');
  const frontendContractsDir = path.join(__dirname, '../../frontend/src/contracts');

  if (!fs.existsSync(backendContractsDir)) fs.mkdirSync(backendContractsDir, { recursive: true });
  if (!fs.existsSync(frontendContractsDir)) fs.mkdirSync(frontendContractsDir, { recursive: true });

  for (const [name, data] of Object.entries(contractsInfo)) {
    const artifact = {
      contractName: name,
      address: data.address,
      abi: data.abi,
      network,
      chainId: Number(chainId),
    };

    fs.writeFileSync(path.join(backendContractsDir, `${name}.json`), JSON.stringify(artifact, null, 2));
    fs.writeFileSync(path.join(frontendContractsDir, `${name}.json`), JSON.stringify(artifact, null, 2));
    console.log(`Synced artifact for ${name} -> backend & frontend`);
  }

  // 9. Update Backend .env if deploying on Sepolia
  if (network === 'sepolia') {
    const backendEnvPath = path.join(__dirname, '../../backend/.env');
    if (fs.existsSync(backendEnvPath)) {
      let envContent = fs.readFileSync(backendEnvPath, 'utf8');

      const updateOrAppend = (key, val) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, `${key}="${val}"`);
        } else {
          envContent += `\n${key}="${val}"`;
        }
      };

      updateOrAppend('AUDIT_LOG_ADDRESS', auditLogAddress);
      updateOrAppend('IDENTITY_REGISTRY_ADDRESS', identityRegistryAddress);
      updateOrAppend('ACCESS_CONTROL_ADDRESS', accessControlAddress);
      updateOrAppend('CONTRACT_ADDRESS', assetNFTAddress);
      updateOrAppend('ASSET_NFT_ADDRESS', assetNFTAddress);

      fs.writeFileSync(backendEnvPath, envContent);
      console.log('Updated backend/.env with new deployed contract addresses!');
    }

    const frontendEnvPath = path.join(__dirname, '../../frontend/.env');
    if (fs.existsSync(frontendEnvPath)) {
      let fEnvContent = fs.readFileSync(frontendEnvPath, 'utf8');

      const updateOrAppendF = (key, val) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(fEnvContent)) {
          fEnvContent = fEnvContent.replace(regex, `${key}="${val}"`);
        } else {
          fEnvContent += `\n${key}="${val}"`;
        }
      };

      updateOrAppendF('VITE_AUDIT_LOG_ADDRESS', auditLogAddress);
      updateOrAppendF('VITE_IDENTITY_REGISTRY_ADDRESS', identityRegistryAddress);
      updateOrAppendF('VITE_ACCESS_CONTROL_ADDRESS', accessControlAddress);
      updateOrAppendF('VITE_CONTRACT_ADDRESS', assetNFTAddress);

      fs.writeFileSync(frontendEnvPath, fEnvContent);
      console.log('Updated frontend/.env with new deployed contract addresses!');
    }
  }

  console.log('\n================================================================');
  console.log('DEPLOYMENT COMPLETE AND SYNCHRONIZED ACROSS FULL TRIAD STACK!');
  console.log('================================================================');
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
