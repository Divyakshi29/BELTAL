import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deploy() {
  console.log('=== Deploying AssetNFT Soulbound Contract to Ethereum Sepolia ===\n');

  const rawKey = config.deployerPrivateKey || process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!rawKey) {
    console.error('[!] DEPLOYER_PRIVATE_KEY is not set in backend/.env or environment.');
    console.log('Please set DEPLOYER_PRIVATE_KEY in backend/.env:');
    console.log('  DEPLOYER_PRIVATE_KEY="<your-64-hex-char-private-key>"');
    process.exit(1);
  }

  const cleanKey = rawKey.trim();

  // Check if user accidentally entered a 40-character public address instead of 64-character private key
  if (cleanKey.length === 42 && cleanKey.startsWith('0x')) {
    console.error(`[!] Configuration Error: You provided a Public Wallet Address (${cleanKey}) instead of a Private Key.`);
    console.log('\nExplanation:');
    console.log(' - A Public Address (40 hex chars) is used to receive tokens.');
    console.log(' - A Private Key (64 hex chars) is required to sign transactions and deploy contracts.');
    console.log('\nHow to export your Private Key from MetaMask:');
    console.log(' 1. Open MetaMask -> Select your account');
    console.log(' 2. Click the 3 dots menu -> Account Details');
    console.log(' 3. Click "Show private key" -> Enter your password -> Copy the 64-character hex key');
    console.log(' 4. Paste it in backend/.env as DEPLOYER_PRIVATE_KEY="<your-private-key>"');
    process.exit(1);
  }

  const rpcCandidates = [
    config.rpcUrl,
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
    'https://sepolia.drpc.org',
  ].filter(Boolean);

  let provider = null;
  let activeRpc = null;

  for (const candidate of rpcCandidates) {
    try {
      const p = new ethers.JsonRpcProvider(candidate);
      await p.getBlockNumber();
      provider = p;
      activeRpc = candidate;
      break;
    } catch {
      // try next
    }
  }

  if (!provider) {
    console.error('[!] Could not connect to any Ethereum Sepolia RPC endpoint.');
    process.exit(1);
  }

  console.log(`Connected to Ethereum Sepolia RPC: ${activeRpc}`);

  let wallet;
  try {
    wallet = new ethers.Wallet(cleanKey, provider);
  } catch (err) {
    console.error(`[!] Invalid Private Key format: ${err.message}`);
    process.exit(1);
  }

  console.log(`Deployer address: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} SepoliaETH\n`);

  if (balance === 0n) {
    console.warn('[!] Deployer account has 0 balance on Sepolia. Please fund it with testnet SepoliaETH first.');
  }

  const artifactPath = path.join(__dirname, '../src/config/contracts/AssetNFT.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  // Calculate estimated gas and adjust gas parameters
  console.log('Estimating deployment gas...');
  const deployTx = await factory.getDeployTransaction(wallet.address);
  const estimatedGas = await wallet.estimateGas(deployTx);
  const feeData = await provider.getFeeData();

  console.log(`Estimated Gas Units: ${estimatedGas.toString()}`);
  console.log(`Current Network Gas Price: ${ethers.formatUnits(feeData.gasPrice || 0n, 'gwei')} Gwei`);

  const gasLimit = (estimatedGas * 120n) / 100n; // 20% buffer
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei');
  const maxFeePerGas = feeData.maxFeePerGas || (feeData.gasPrice || ethers.parseUnits('10', 'gwei'));

  const totalCost = ethers.formatEther(gasLimit * maxFeePerGas);
  console.log(`Target Max Transaction Cost: ${totalCost} SepoliaETH`);

  console.log('Broadcasting deployment transaction to Ethereum Sepolia...');
  const contract = await factory.deploy(wallet.address, {
    gasLimit,
    maxPriorityFeePerGas,
    maxFeePerGas,
  });
  console.log(`Transaction submitted! Hash: ${contract.deploymentTransaction().hash}`);
  console.log('Waiting for confirmation on Ethereum Sepolia...');
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`\n[SUCCESS] AssetNFT Contract deployed at: ${contractAddress}`);
  console.log(`Etherscan: https://sepolia.etherscan.io/address/${contractAddress}`);

  // Update artifact files with deployed address
  artifact.contractAddress = contractAddress;
  artifact.deployedAt = new Date().toISOString();

  const targets = [
    path.join(__dirname, '../../blockchain/artifacts/AssetNFT.json'),
    path.join(__dirname, '../src/config/contracts/AssetNFT.json'),
    path.join(__dirname, '../../frontend/src/contracts/AssetNFT.json'),
  ];

  for (const target of targets) {
    fs.writeFileSync(target, JSON.stringify(artifact, null, 2));
    console.log(`Updated ${target} with deployed contractAddress`);
  }

  // Update backend/.env and frontend/.env
  const backendEnvPath = path.join(__dirname, '../.env');
  if (fs.existsSync(backendEnvPath)) {
    let envContent = fs.readFileSync(backendEnvPath, 'utf8');
    envContent = envContent.replace(/CONTRACT_ADDRESS=.*$/m, `CONTRACT_ADDRESS="${contractAddress}"`);
    fs.writeFileSync(backendEnvPath, envContent);
    console.log(`Updated backend/.env with CONTRACT_ADDRESS="${contractAddress}"`);
  }

  const frontendEnvPath = path.join(__dirname, '../../frontend/.env');
  if (fs.existsSync(frontendEnvPath)) {
    let envContent = fs.readFileSync(frontendEnvPath, 'utf8');
    envContent = envContent.replace(/VITE_CONTRACT_ADDRESS=.*$/m, `VITE_CONTRACT_ADDRESS="${contractAddress}"`);
    fs.writeFileSync(frontendEnvPath, envContent);
    console.log(`Updated frontend/.env with VITE_CONTRACT_ADDRESS="${contractAddress}"`);
  }

  console.log('\nContract deployment and full-stack configuration complete!');
}

deploy().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
