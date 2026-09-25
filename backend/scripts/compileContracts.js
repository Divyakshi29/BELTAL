import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contractPath = path.join(__dirname, '../../blockchain/contracts/AssetNFT.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'AssetNFT.sol': {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode'],
      },
    },
  },
};

console.log('Compiling AssetNFT.sol with solc...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  let hasError = false;
  output.errors.forEach((err) => {
    if (err.severity === 'error') {
      console.error(err.formattedMessage);
      hasError = true;
    } else {
      console.warn(err.formattedMessage);
    }
  });
  if (hasError) {
    process.exit(1);
  }
}

const contract = output.contracts['AssetNFT.sol']['AssetNFT'];
const artifact = {
  contractName: 'AssetNFT',
  deployerAddress: '0x334eEfB6fc223ABf74D5F00E635B63c544689E8f',
  network: 'ethereum-sepolia',
  abi: contract.abi,
  bytecode: contract.evm.bytecode.object,
};

// Write artifact to blockchain/artifacts, backend/src/config/contracts, frontend/src/contracts
const targets = [
  path.join(__dirname, '../../blockchain/artifacts/AssetNFT.json'),
  path.join(__dirname, '../src/config/contracts/AssetNFT.json'),
  path.join(__dirname, '../../frontend/src/contracts/AssetNFT.json'),
];

for (const target of targets) {
  const dir = path.dirname(target);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(target, JSON.stringify(artifact, null, 2));
  console.log(`[PASS] Saved compiled artifact to ${target}`);
}

console.log('AssetNFT contract compilation and artifact generation complete!');
