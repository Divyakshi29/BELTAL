import { ethers } from 'ethers';
import config from '../src/config/env.js';
import assetNftAbi from '../src/config/contracts/AssetNFT.json' with { type: 'json' };

async function main() {
  const rpcUrl = config.rpcUrl;
  const contractAddress = config.assetNftAddress || config.contractAddress;
  console.log('RPC URL:', rpcUrl);
  console.log('AssetNFT Address:', contractAddress);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, assetNftAbi.abi || assetNftAbi, provider);

  for (let tokenId = 1001; tokenId <= 1010; tokenId++) {
    try {
      const asset = await contract.assets(tokenId);
      const custodian = await contract.custodians(tokenId);
      if (custodian && custodian !== '0x0000000000000000000000000000000000000000') {
        console.log(`Token #${tokenId}:`, {
          tag: asset.assetTag,
          serialNumber: asset.serialNumber,
          tier: Number(asset.classificationTier),
          sbu: ethers.decodeBytes32String(asset.sbu),
          custodian,
          mintedAt: new Date(Number(asset.mintedAt) * 1000).toISOString()
        });
      } else {
        console.log(`Token #${tokenId}: unminted / empty custodian`);
      }
    } catch (e) {
      console.log(`Token #${tokenId}: error reading (${e.message})`);
    }
  }
}

main().catch(console.error);
