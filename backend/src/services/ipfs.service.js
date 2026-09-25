import config from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';

const PINATA_PIN_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PINATA_TIMEOUT_MS = 30_000;

export const ipfsService = {
  isConfigured() {
    return Boolean(config.pinataJwt || (config.pinataApiKey && config.pinataApiSecret));
  },

  /**
   * Pins a JSON-serializable payload to IPFS via Pinata and returns its CID.
   * Callers are responsible for encrypting anything PII before it gets here —
   * this helper doesn't know or care what the payload contains.
   */
  async pinJson(payload, { name } = {}) {
    if (!this.isConfigured()) {
      throw new ApiError(503, 'IPFS/Pinata is not configured (PINATA_JWT or PINATA_API_KEY/SECRET missing)');
    }

    const getHeaders = (useApiKey = false) => {
      const headers = { 'Content-Type': 'application/json' };
      if (!useApiKey && config.pinataJwt) {
        headers.Authorization = `Bearer ${config.pinataJwt}`;
      } else if (config.pinataApiKey && config.pinataApiSecret) {
        headers.pinata_api_key = config.pinataApiKey;
        headers.pinata_secret_api_key = config.pinataApiSecret;
      }
      return headers;
    };

    // Everything BELTAL pins goes into one dedicated Pinata group when
    // PINATA_GROUP_ID is set, so project pins stay separable from anything
    // else on the same Pinata account (and can be listed/unpinned as a set).
    const body = JSON.stringify({
      pinataContent: payload,
      ...(name ? { pinataMetadata: { name } } : {}),
      ...(config.pinataGroupId ? { pinataOptions: { groupId: config.pinataGroupId } } : {}),
    });

    // Bounded so a stalled Pinata connection can't hang the request forever;
    // network-level failures surface as a 502 like an HTTP error would.
    const post = async (useApiKey) => {
      try {
        return await fetch(PINATA_PIN_JSON_URL, {
          method: 'POST',
          headers: getHeaders(useApiKey),
          body,
          signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
        });
      } catch (err) {
        logger.error(`Pinata request failed: ${err.message}`);
        throw new ApiError(502, 'Failed to pin dossier to IPFS');
      }
    };

    let response = await post(false);

    // If JWT failed and API key/secret are available, retry with API key/secret
    if (!response.ok && config.pinataApiKey && config.pinataApiSecret && config.pinataJwt) {
      logger.warn('Pinata JWT auth failed, retrying with PINATA_API_KEY and PINATA_API_SECRET...');
      response = await post(true);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      logger.error(`Pinata pin failed: ${response.status} ${text}`);
      throw new ApiError(502, 'Failed to pin dossier to IPFS');
    }

    const data = await response.json();
    return data.IpfsHash;
  },

  /**
   * Reads a previously pinned JSON document back through the Pinata gateway.
   * Returns whatever was pinned — for BELTAL content that is the AES-256-GCM
   * envelope from dossier.util.js, which the caller decrypts. Used by the
   * metadata-by-CID endpoint and the anti-tamper verifier.
   */
  async fetchJson(cid) {
    const gateway = config.pinataGateway || 'https://gateway.pinata.cloud/ipfs';
    let response;
    try {
      response = await fetch(`${gateway}/${cid}`, {
        signal: AbortSignal.timeout(PINATA_TIMEOUT_MS),
      });
    } catch (err) {
      logger.error(`IPFS gateway request failed for ${cid}: ${err.message}`);
      throw new ApiError(502, 'Could not reach the IPFS gateway');
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new ApiError(404, 'No content pinned at that CID');
      }
      logger.error(`IPFS gateway returned ${response.status} for ${cid}`);
      throw new ApiError(502, 'Could not read content from the IPFS gateway');
    }

    try {
      return await response.json();
    } catch {
      throw new ApiError(422, 'Content at that CID is not the JSON document BELTAL pinned');
    }
  },
};

export default ipfsService;
