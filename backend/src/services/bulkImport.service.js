import { ethers } from 'ethers';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import chainService from './chain.service.js';
import ipfsService from './ipfs.service.js';
import { buildDid, computeIdentityHash, encryptDossier } from '../utils/dossier.util.js';
import crypto from 'crypto';

/**
 * Bulk identity import from an HRMS CSV export (issue #51).
 *
 * The order of operations is the whole design. Every row is validated first
 * and the caller gets the full per-row report before a single transaction is
 * sent — an admin should never discover on row 180 of 200 that the file was
 * malformed, with 179 identities already anchored on-chain and unrewindable.
 * Only once every row passes does the import pin dossiers, register the
 * identities in on-chain batches of at most 250 (the contract's own ceiling),
 * and write the Postgres cache rows.
 */

// IdentityRegistry.batchRegisterIdentities reverts above 250 per transaction.
const MAX_BATCH_SIZE = 250;

const VALID_SBUS = ['SBU_RADAR', 'SBU_EW', 'SBU_MILCOMM', 'SBU_CYBER'];
const VALID_ROLES = ['ADMIN', 'MANAGER', 'AUDITOR', 'USER', 'SYSTEM_CONNECTOR'];
const REQUIRED_COLUMNS = ['walletaddress', 'externalid', 'fullname', 'sbu', 'clearancelevel'];

/**
 * Minimal RFC 4180 CSV reader: handles quoted fields, embedded commas and
 * newlines, and doubled quotes. Deliberately hand-rolled rather than pulling in
 * a parser dependency for one endpoint.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const source = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += char;
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += char;
  }

  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  // Drop entirely blank lines (trailing newline, spacer rows).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Validates one parsed row. Returns { valid, errors, identity }. */
function validateRow(raw, seen) {
  const errors = [];

  const walletAddress = (raw.walletaddress || '').trim();
  const externalId = (raw.externalid || '').trim();
  const fullName = (raw.fullname || '').trim();
  const sbu = (raw.sbu || '').trim().toUpperCase();
  const clearanceRaw = (raw.clearancelevel || '').trim();
  const role = (raw.role || 'USER').trim().toUpperCase();

  let checksumAddress = null;
  if (!walletAddress) {
    errors.push('walletAddress is required');
  } else {
    try {
      checksumAddress = ethers.getAddress(walletAddress);
    } catch {
      errors.push(`"${walletAddress}" is not a valid Ethereum address`);
    }
  }

  if (!externalId) errors.push('externalId (employee code) is required');
  if (!fullName) errors.push('fullName is required');
  if (!VALID_SBUS.includes(sbu)) errors.push(`sbu must be one of ${VALID_SBUS.join(', ')}`);

  const clearanceLevel = Number.parseInt(clearanceRaw, 10);
  if (!Number.isInteger(clearanceLevel) || clearanceLevel < 1 || clearanceLevel > 4) {
    errors.push('clearanceLevel must be a whole number from 1 to 4');
  }

  if (!VALID_ROLES.includes(role)) errors.push(`role must be one of ${VALID_ROLES.join(', ')}`);

  // Duplicates inside the file itself — the DB unique constraint would catch
  // these, but only after some of the batch had already been committed.
  if (checksumAddress) {
    if (seen.addresses.has(checksumAddress.toLowerCase())) {
      errors.push('duplicate walletAddress within this file');
    } else seen.addresses.add(checksumAddress.toLowerCase());
  }
  if (externalId) {
    if (seen.externalIds.has(externalId.toLowerCase())) {
      errors.push('duplicate externalId within this file');
    } else seen.externalIds.add(externalId.toLowerCase());
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    errors: [],
    identity: {
      walletAddress: checksumAddress,
      externalId,
      fullName,
      sbu,
      clearanceLevel,
      role,
      did: buildDid({ externalId, walletAddress: checksumAddress }),
    },
  };
}

export const bulkImportService = {
  /**
   * Stage one: parse, validate, and check the file against what is already in
   * the database. Never writes anything and never touches the chain, so the
   * admin UI can preview generated DIDs before committing.
   */
  async validateCsv(csvText) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      throw new ApiError(400, 'The CSV needs a header row and at least one data row');
    }

    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]/g, ''));
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length > 0) {
      throw new ApiError(
        400,
        `CSV is missing required column(s): ${missing.join(', ')}. Expected header: walletAddress, externalId, fullName, sbu, clearanceLevel, role (optional)`
      );
    }

    const seen = { addresses: new Set(), externalIds: new Set() };
    const valid = [];
    const invalid = [];

    for (let i = 1; i < rows.length; i += 1) {
      const raw = {};
      header.forEach((column, index) => { raw[column] = rows[i][index] ?? ''; });

      // Line number as the admin sees it in a spreadsheet: header is line 1.
      const line = i + 1;
      const result = validateRow(raw, seen);
      if (result.valid) valid.push({ line, ...result.identity });
      else invalid.push({ line, errors: result.errors, raw: rows[i].join(',').slice(0, 200) });
    }

    // Collisions with identities that already exist are a row-level failure
    // too, caught here rather than as a mid-import database error.
    if (valid.length > 0) {
      const existing = await prisma.user.findMany({
        where: {
          OR: [
            { walletAddress: { in: valid.map((v) => v.walletAddress) } },
            { externalId: { in: valid.map((v) => v.externalId) } },
          ],
        },
        select: { walletAddress: true, externalId: true },
      });

      if (existing.length > 0) {
        const takenAddresses = new Set(existing.map((e) => e.walletAddress.toLowerCase()));
        const takenIds = new Set(existing.map((e) => (e.externalId || '').toLowerCase()));

        for (let i = valid.length - 1; i >= 0; i -= 1) {
          const row = valid[i];
          const clashes = [];
          if (takenAddresses.has(row.walletAddress.toLowerCase())) {
            clashes.push('an identity already exists for this wallet address');
          }
          if (takenIds.has(row.externalId.toLowerCase())) {
            clashes.push('an identity already exists for this employee code');
          }
          if (clashes.length > 0) {
            invalid.push({ line: row.line, errors: clashes, raw: row.externalId });
            valid.splice(i, 1);
          }
        }
      }
    }

    invalid.sort((a, b) => a.line - b.line);

    return {
      totalRows: rows.length - 1,
      validCount: valid.length,
      invalidCount: invalid.length,
      // The DID preview the admin confirms before committing.
      preview: valid.map(({ line, did, externalId, fullName, sbu, clearanceLevel, role, walletAddress }) => ({
        line, did, externalId, fullName, sbu, clearanceLevel, role, walletAddress,
      })),
      invalidRows: invalid,
      batches: Math.ceil(valid.length / MAX_BATCH_SIZE),
      valid,
    };
  },

  /**
   * Stage two: commit. Refuses to start unless every row passed validation, so
   * a partially-bad file is fixed in the spreadsheet rather than half-imported.
   */
  async importCsv(csvText, { actorId } = {}) {
    const validation = await this.validateCsv(csvText);

    if (validation.invalidCount > 0) {
      // Nothing has been written or sent on-chain at this point.
      throw Object.assign(
        new ApiError(422, `${validation.invalidCount} row(s) failed validation; no identities were imported`),
        { details: { invalidRows: validation.invalidRows, validCount: validation.validCount } }
      );
    }

    if (validation.validCount === 0) {
      throw new ApiError(400, 'No importable rows found in the CSV');
    }

    if (!ipfsService.isConfigured()) {
      throw new ApiError(503, 'IPFS/Pinata must be configured before importing identities');
    }

    const rows = validation.valid;

    // Pin each encrypted dossier first. A pin failure here still costs nothing
    // on-chain, so the import can be abandoned cleanly.
    const prepared = [];
    for (const row of rows) {
      const identitySalt = crypto.randomBytes(16).toString('hex');
      const identityHash = computeIdentityHash({
        externalId: row.externalId,
        fullName: row.fullName,
        sbu: row.sbu,
        salt: identitySalt,
      });

      const dossierCid = await ipfsService.pinJson(
        encryptDossier({
          externalId: row.externalId,
          fullName: row.fullName,
          sbu: row.sbu,
          clearanceLevel: row.clearanceLevel,
          registeredAt: new Date().toISOString(),
          importedBy: actorId ?? null,
        }),
        { name: `identity-dossier-${row.externalId}` }
      );

      prepared.push({ ...row, identitySalt, identityHash, dossierCid });
    }

    const batchResults = [];
    let imported = 0;

    for (let start = 0; start < prepared.length; start += MAX_BATCH_SIZE) {
      const chunk = prepared.slice(start, start + MAX_BATCH_SIZE);
      const batchNumber = Math.floor(start / MAX_BATCH_SIZE) + 1;

      const chainResult = await chainService.batchRegisterIdentitiesOnChain({
        users: chunk.map((r) => r.walletAddress),
        dids: chunk.map((r) => r.did),
        hashes: chunk.map((r) => r.identityHash),
        clearances: chunk.map((r) => r.clearanceLevel),
        sbus: chunk.map((r) => r.sbu),
      });

      if (!chainResult.confirmed) {
        // Report the failure and stop: continuing would leave the operator
        // unsure which half of the file made it on-chain.
        logger.error(`Bulk import batch ${batchNumber} failed: ${chainResult.error}`);
        batchResults.push({
          batch: batchNumber,
          size: chunk.length,
          confirmed: false,
          error: chainResult.error,
          lines: chunk.map((r) => r.line),
        });
        break;
      }

      // Cache rows only after the chain call for this batch confirmed.
      await prisma.user.createMany({
        data: chunk.map((r) => ({
          walletAddress: r.walletAddress,
          externalId: r.externalId,
          did: r.did,
          displayName: r.fullName,
          role: r.role,
          clearanceLevel: r.clearanceLevel,
          sbu: r.sbu,
          identityHash: r.identityHash,
          identitySalt: r.identitySalt,
          dossierCid: r.dossierCid,
        })),
        skipDuplicates: true,
      });

      // Roles are granted per wallet — AccessControl has no batch grant. A
      // failure here is reported but does not undo the registration; an admin
      // completes it from the role-assignment screen, same as single
      // registration (see identity.service.registerIdentity).
      const roleFailures = [];
      for (const row of chunk) {
        const grant = await chainService.grantRoleOnChain({
          walletAddress: row.walletAddress,
          role: row.role,
        });
        if (grant.error) roleFailures.push({ externalId: row.externalId, error: grant.error });
      }

      imported += chunk.length;
      batchResults.push({
        batch: batchNumber,
        size: chunk.length,
        confirmed: true,
        txHash: chainResult.txHash,
        blockNumber: chainResult.blockNumber,
        rolesGranted: chunk.length - roleFailures.length,
        roleFailures,
      });

      logger.info(`Bulk import batch ${batchNumber}: ${chunk.length} identities, tx ${chainResult.txHash}`);
    }

    const failedBatch = batchResults.find((b) => !b.confirmed);

    return {
      totalRows: validation.totalRows,
      imported,
      notImported: prepared.length - imported,
      batches: batchResults,
      // Surfaced so the UI can show a warning banner rather than a success toast.
      partialFailure: Boolean(failedBatch),
    };
  },
};

export default bulkImportService;
