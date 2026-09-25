import crypto from 'crypto';
import { ethers } from 'ethers';
import config from '../config/env.js';

const ALGO = 'aes-256-gcm';

function getKey() {
  return Buffer.from(config.dossierEncryptionKey, 'hex');
}

/**
 * The DID written to IdentityRegistry and stored on the User row. Derived from
 * the employee code so it is stable and human-traceable, falling back to the
 * address when an identity has no external code. It lives here, in one place,
 * because the same string has to reach the contract, Postgres and the demo
 * seed — and the migration that backfilled `User.did` reproduces this exact
 * rule in SQL.
 */
export function buildDid({ externalId, walletAddress }) {
  return `did:beltal:${externalId || walletAddress.slice(2, 10)}`;
}

/**
 * identityHash = keccak256(externalId, fullName, sbu, salt), computed once at
 * registration (issue #44) and persisted alongside the salt so an auditor can
 * independently recompute and verify it later without needing the plaintext
 * dossier.
 */
export function computeIdentityHash({ externalId, fullName, sbu, salt }) {
  return ethers.solidityPackedKeccak256(
    ['string', 'string', 'string', 'string'],
    [externalId, fullName, sbu, salt]
  );
}

/** AES-256-GCM encrypt a JSON-serializable PII dossier before it leaves for IPFS. */
export function encryptDossier(dossier) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(dossier), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algo: ALGO,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

/** Inverse of encryptDossier — used by the (future) verification/anti-tamper tooling. */
export function decryptDossier(encrypted) {
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

export default { buildDid, computeIdentityHash, encryptDossier, decryptDossier };
