import { ethers } from 'ethers';
import { SEPOLIA_CONFIG, CONTRACT_ADDRESSES, CONTRACT_ABIS } from '../config/contracts.js';

export const web3Service = {
  getEthereum() {
    if (typeof window !== 'undefined' && window.ethereum) {
      return window.ethereum;
    }
    return null;
  },

  async connectWallet() {
    const eth = this.getEthereum();
    if (!eth) {
      throw new Error('MetaMask or Web3 wallet is not installed. Please install MetaMask.');
    }

    // Ensure we are on Ethereum Sepolia
    await this.switchToSepolia();

    const provider = new ethers.BrowserProvider(eth);
    await provider.send('eth_requestAccounts', []);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    return { provider, signer, address };
  },

  async switchToSepolia() {
    const eth = this.getEthereum();
    if (!eth) return;

    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CONFIG.chainIdHex }],
      });
    } catch (switchError) {
      // If network is not added in user's wallet, add it
      if (switchError.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: SEPOLIA_CONFIG.chainIdHex,
              chainName: SEPOLIA_CONFIG.name,
              rpcUrls: [SEPOLIA_CONFIG.rpcUrl],
              nativeCurrency: SEPOLIA_CONFIG.nativeCurrency,
              blockExplorerUrls: [SEPOLIA_CONFIG.explorerUrl],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }
  },

  async signMessage(message) {
    const { signer } = await this.connectWallet();
    return await signer.signMessage(message);
  },

  /**
   * Live head block from the configured RPC. Used for the network indicator in
   * the app chrome — the number shown has to be a real one an auditor could
   * check on Etherscan, not decoration. Returns null if the RPC is unreachable
   * so the caller can show "offline" rather than a stale or invented figure.
   */
  async getBlockNumber() {
    try {
      const provider = new ethers.JsonRpcProvider(SEPOLIA_CONFIG.rpcUrl);
      return await provider.getBlockNumber();
    } catch {
      return null;
    }
  },

  getReadOnlyContract() {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_CONFIG.rpcUrl);
    return new ethers.Contract(CONTRACT_ADDRESSES.AssetNFT, CONTRACT_ABIS.AssetNFT, provider);
  },

  async getWritableContract() {
    const { signer } = await this.connectWallet();
    return new ethers.Contract(CONTRACT_ADDRESSES.AssetNFT, CONTRACT_ABIS.AssetNFT, signer);
  },
};

export default web3Service;
