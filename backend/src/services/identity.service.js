import { ethers } from 'ethers';
import crypto from 'crypto';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import chainService from './chain.service.js';
import ipfsService from './ipfs.service.js';
import { buildDid, computeIdentityHash, encryptDossier } from '../utils/dossier.util.js';

export const identityService = {
  /**
   * Admin: register a new identity (issue #44).
   * Order matters: dossier is pinned to IPFS and the chain call is attempted
   * before the Postgres row is written, so a mid-flight failure never leaves
   * a DB row pointing at a dossier/tx that doesn't actually exist.
   */
  async registerIdentity(input) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    let checksumAddress;
    try {
      checksumAddress = ethers.getAddress(input.walletAddress);
    } catch {
      throw new ApiError(400, 'Invalid Ethereum wallet address');
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ walletAddress: checksumAddress }, { externalId: input.externalId }] },
    });
    if (existing) {
      throw new ApiError(409, 'An identity already exists for this wallet address or employee code');
    }

    const identitySalt = crypto.randomBytes(16).toString('hex');
    const identityHash = computeIdentityHash({
      externalId: input.externalId,
      fullName: input.fullName,
      sbu: input.sbu,
      salt: identitySalt,
    });

    // Zero PII on-chain: only DID/wallet/hash go to the contract. Full PII
    // (fullName, employee code, plus any extra dossier fields) is encrypted
    // and pinned to IPFS; Postgres keeps only the display-relevant subset
    // (displayName/externalId) in plaintext for dashboards. See issues.txt #89.
    const dossier = {
      externalId: input.externalId,
      fullName: input.fullName,
      sbu: input.sbu,
      clearanceLevel: input.clearanceLevel,
      ...input.piiDossier,
      registeredAt: new Date().toISOString(),
    };
    const dossierCid = await ipfsService.pinJson(encryptDossier(dossier), {
      name: `identity-dossier-${input.externalId}`,
    });

    const did = buildDid({ externalId: input.externalId, walletAddress: checksumAddress });
    const chainResult = await chainService.registerIdentityOnChain({
      walletAddress: checksumAddress,
      did,
      identityHash,
      clearanceLevel: input.clearanceLevel,
      sbu: input.sbu,
    });
    if (chainResult.error) {
      throw new ApiError(502, `On-chain identity registration failed: ${chainResult.error}`);
    }
    if (!chainResult.confirmed) {
      logger.warn(`Identity for ${checksumAddress} will be created off-chain only pending contract integration.`);
    }

    // Grant the matching AccessControl role once the identity is anchored. The
    // identity is already on-chain at this point and re-registering it would
    // revert, so a failed grant must not abort the request: the DB row is still
    // written and the failure is surfaced as chain.roleGranted=false plus a
    // warning. An admin completes it with PATCH /admin/identities/:id/role
    // (updateRole re-grants; grantRole is idempotent on-chain). An unconfigured
    // contract just leaves roleGranted=false, like the off-chain fallback above.
    const role = input.role ?? 'USER';
    const chain = { ...chainResult, roleGranted: false };
    if (chainResult.confirmed) {
      const grant = await chainService.grantRoleOnChain({ walletAddress: checksumAddress, role });
      if (grant.error) {
        chain.roleError = grant.error;
        chain.warning = `Identity registered on-chain but granting the ${role} role failed; re-apply the role (role assignment) to complete it.`;
        logger.error(`Identity for ${checksumAddress} is on-chain without its ${role} role: ${grant.error}`);
      } else {
        chain.roleGranted = grant.confirmed;
        chain.roleTxHash = grant.txHash;
      }
    }

    const user = await prisma.user.create({
      data: {
        walletAddress: checksumAddress,
        externalId: input.externalId,
        did,
        displayName: input.displayName ?? input.fullName,
        role,
        clearanceLevel: input.clearanceLevel,
        sbu: input.sbu,
        identityHash,
        identitySalt,
        dossierCid,
      },
    });

    return { user, chain };
  },

  /**
   * Admin: assign/update role and/or clearance for an existing identity (issue #44).
   * Safe to repeat: the on-chain clearance update, grantRole and revokeRole are all
   * idempotent, and the DB row is only written after they succeed. Re-submitting the
   * identity's current role therefore completes a grant that failed at registration
   * (see registerIdentity) or a revoke that failed part-way through a role change.
   */
  async updateRole(userId, { role, clearanceLevel }) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, 'Identity not found');
    if (user.revokedAt) {
      throw new ApiError(409, 'This identity is revoked. Reinstate it before changing its role or clearance.');
    }

    const chainResult = await chainService.assignRoleOnChain({
      walletAddress: user.walletAddress,
      role: role ?? user.role,
      previousRole: user.role,
      clearanceLevel: clearanceLevel ?? user.clearanceLevel,
    });
    // A chain failure here must not block the update: this endpoint is the
    // documented way to re-apply a role/clearance grant that failed earlier
    // (at registration, or on a previous call here) — hard-failing it the
    // same way would leave no way to ever recover from a persistent chain
    // problem (RPC hiccup, signer without the on-chain admin role, etc.).
    // Mirrors registerIdentity's tolerance of a failed role grant.
    //
    // One revert reason gets a distinct message: IdentityRegistry's
    // "Identity not active" require fires both when a DID was genuinely
    // revoked *and* when the address was never registered on-chain at all
    // (Solidity defaults an unwritten struct's `isActive` to false, so the
    // contract cannot tell the two apart — see IdentityRegistry.sol
    // updateClearance/revokeIdentity). The revokedAt check above already
    // rules out a real revocation, so if this specific revert reaches here,
    // the DB row was never backed by a successful on-chain registration
    // (e.g. registerIdentity's documented "confirmed:false, no error"
    // fallback when the contracts weren't reachable/configured at creation
    // time, or an --offchain demo seed). Retrying this same role/clearance
    // update can never fix that — only re-registering the identity on-chain
    // can — so say so instead of leaving the admin to retry a call that is
    // guaranteed to keep failing the same way.
    const chain = { ...chainResult };
    if (chainResult.error) {
      const neverRegisteredOnChain = /identity not active/i.test(chainResult.error);
      chain.warning = neverRegisteredOnChain
        ? 'On-chain role/clearance update failed because this identity was never fully registered on-chain (the database record exists, but IdentityRegistry has no active entry for this wallet). Retrying this role/clearance update will not fix it — re-register the identity on-chain (e.g. via reinstate, or re-run registration) before retrying.'
        : `On-chain role/clearance update failed and was applied off-chain only: ${chainResult.error}`;
      logger.error(`Role/clearance update for ${user.walletAddress} failed on-chain: ${chainResult.error}`);
    } else if (!chainResult.confirmed) {
      logger.warn(`Role/clearance update for ${user.walletAddress} applied off-chain only pending contract integration.`);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(role !== undefined ? { role } : {}),
        ...(clearanceLevel !== undefined ? { clearanceLevel } : {}),
      },
    });

    return { user: updated, chain };
  },

  /**
   * Admin: set who an identity reports to and/or their organizational grade
   * (an approximation of BEL's E1-E9 executive ladder — seniority/rank, not
   * the same thing as clearanceLevel, which is security-classification
   * access). Purely off-chain and independent of RBAC/SBU: it exists so the
   * org chart is explicit instead of implicit in "whoever has role MANAGER
   * in my SBU". No chain call, since neither reporting lines nor grade gate
   * anything the contracts enforce.
   */
  async updateOrgAssignment(userId, { managerId, seniorityGrade }) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, 'Identity not found');
    if (user.revokedAt) {
      throw new ApiError(409, 'This identity is revoked. Reinstate it before changing its manager or grade.');
    }

    const data = {};
    if (seniorityGrade !== undefined) data.seniorityGrade = seniorityGrade;

    if (managerId !== undefined) {
      if (managerId === null) {
        data.managerId = null;
      } else {
        if (managerId === userId) {
          throw new ApiError(400, 'A person cannot be their own manager');
        }

        const manager = await prisma.user.findUnique({ where: { id: managerId } });
        if (!manager) throw new ApiError(404, 'Manager identity not found');
        if (manager.revokedAt) throw new ApiError(409, 'Cannot assign a revoked identity as a manager');

        // Walk the prospective manager's own chain up to the root to make
        // sure this assignment would not create a cycle (A reports to B who
        // — directly or transitively — reports to A).
        const seen = new Set([userId]);
        let cursorId = manager.managerId;
        while (cursorId) {
          if (cursorId === userId) {
            throw new ApiError(400, 'This assignment would create a reporting cycle');
          }
          if (seen.has(cursorId)) break; // a pre-existing cycle elsewhere; not this call's problem
          seen.add(cursorId);
          const next = await prisma.user.findUnique({ where: { id: cursorId }, select: { managerId: true } });
          cursorId = next?.managerId ?? null;
        }

        const effectiveGrade = seniorityGrade !== undefined ? seniorityGrade : user.seniorityGrade;
        if (effectiveGrade != null && manager.seniorityGrade != null && manager.seniorityGrade < effectiveGrade) {
          throw new ApiError(
            400,
            `Manager's grade (${manager.seniorityGrade}) must be at or above the report's grade (${effectiveGrade})`
          );
        }

        data.managerId = managerId;
      }
    }

    if (Object.keys(data).length === 0) {
      throw new ApiError(400, 'At least one of managerId or seniorityGrade must be provided');
    }

    return prisma.user.update({
      where: { id: userId },
      data,
      include: { manager: { select: { id: true, displayName: true, seniorityGrade: true } } },
    });
  },

  /**
   * Admin: revoke (quarantine) an identity.
   * The chain goes first, so the DB never claims a revocation the contract does
   * not know about. Two on-chain steps: IdentityRegistry.revokeIdentity marks
   * the DID inactive (blocks zone access and custody), and AccessControl
   * .revokeRole strips the wallet's role (blocks minting/approving straight
   * from the contract). The DB row is stamped last; from then on `authenticate`
   * rejects the person on their next request rather than when the JWT expires.
   * Safe to retry: if a previous attempt revoked on-chain but failed before the
   * DB write, the contract's "not active" revert is treated as already done.
   */
  async revokeIdentity(actor, userId, reason) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, 'Identity not found');
    if (user.id === actor?.id) throw new ApiError(403, 'You cannot revoke your own identity');
    if (user.revokedAt) throw new ApiError(409, 'This identity is already revoked');

    // Never lock everyone out of the admin console.
    if (user.role === 'ADMIN') {
      const otherAdmins = await prisma.user.count({
        where: { role: 'ADMIN', revokedAt: null, id: { not: user.id } },
      });
      if (otherAdmins === 0) {
        throw new ApiError(409, 'This is the last active administrator and cannot be revoked');
      }
    }

    const revoke = await chainService.revokeIdentityOnChain({ walletAddress: user.walletAddress, reason });
    const alreadyRevokedOnChain = /identity not active/i.test(revoke.error || '');
    if (revoke.error && !alreadyRevokedOnChain) {
      throw new ApiError(502, `On-chain identity revocation failed: ${revoke.error}`);
    }
    if (!revoke.confirmed && !alreadyRevokedOnChain) {
      logger.warn(`Revocation of ${user.walletAddress} applied off-chain only pending contract integration.`);
    }

    // The identity is already inactive on-chain and cannot be revoked twice, so
    // a failed role revoke must not abort the request. Same recovery shape as a
    // failed grant at registration: surface a warning, let the admin re-apply.
    const chain = {
      txHash: revoke.txHash ?? null,
      blockNumber: revoke.blockNumber ?? null,
      confirmed: Boolean(revoke.confirmed) || alreadyRevokedOnChain,
      roleRevoked: false,
    };
    if (chain.confirmed) {
      const roleRevoke = await chainService.revokeRoleOnChain({ walletAddress: user.walletAddress, role: user.role });
      if (roleRevoke.error) {
        chain.roleError = roleRevoke.error;
        chain.warning = `Identity revoked on-chain but removing the ${user.role} role failed; the wallet may still hold that role on the contract.`;
        logger.error(`Identity ${user.walletAddress} is revoked but still holds ${user.role} on-chain: ${roleRevoke.error}`);
      } else {
        chain.roleRevoked = roleRevoke.confirmed;
        chain.roleTxHash = roleRevoke.txHash ?? null;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        revokedAt: new Date(),
        revocationReason: reason,
        revokeTxHash: chain.txHash,
      },
    });

    logger.warn(
      `[Identity] ${user.walletAddress} (${user.did || user.externalId || user.id}) revoked by ${actor?.walletAddress || actor?.id}: ${reason}`
    );
    return { user: updated, chain };
  },

  /**
   * Admin: lift a quarantine, OR repair an identity that's active in the DB
   * but was never actually confirmed on-chain (see updateRole's "Identity not
   * active" handling — IdentityRegistry can't tell "revoked" and "never
   * registered" apart, so neither can this function need to). Either way the
   * fix is the same primitive: the registry has no un-revoke, so this
   * re-registers the same wallet with the same DID, identity hash, clearance
   * and SBU (the contract allows it whenever the record is inactive, for
   * whatever reason), then re-grants the role. Guardian recovery uses the
   * same primitive to re-anchor an identity. Deliberately does NOT require
   * user.revokedAt: re-registering an identity that's already properly active
   * on-chain is a safe no-op (tolerated below as "already registered"), so
   * there's no unsafe case to guard against by requiring it.
   */
  async reinstateIdentity(actor, userId) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(404, 'Identity not found');

    const register = await chainService.registerIdentityOnChain({
      walletAddress: user.walletAddress,
      did: user.did || buildDid({ externalId: user.externalId, walletAddress: user.walletAddress }),
      identityHash: user.identityHash,
      clearanceLevel: user.clearanceLevel,
      sbu: user.sbu,
    });
    const alreadyActiveOnChain = /already registered/i.test(register.error || '');
    if (register.error && !alreadyActiveOnChain) {
      throw new ApiError(502, `On-chain reinstatement failed: ${register.error}`);
    }
    if (!register.confirmed && !alreadyActiveOnChain) {
      logger.warn(`Reinstatement of ${user.walletAddress} applied off-chain only pending contract integration.`);
    }

    const chain = {
      txHash: register.txHash ?? null,
      blockNumber: register.blockNumber ?? null,
      confirmed: Boolean(register.confirmed) || alreadyActiveOnChain,
      roleGranted: false,
    };
    if (chain.confirmed) {
      const grant = await chainService.grantRoleOnChain({ walletAddress: user.walletAddress, role: user.role });
      if (grant.error) {
        chain.roleError = grant.error;
        chain.warning = `Identity reinstated on-chain but granting the ${user.role} role failed; re-apply the role (role assignment) to complete it.`;
        logger.error(`Identity ${user.walletAddress} is reinstated without its ${user.role} role: ${grant.error}`);
      } else {
        chain.roleGranted = grant.confirmed;
        chain.roleTxHash = grant.txHash ?? null;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { revokedAt: null, revocationReason: null, revokeTxHash: null },
    });

    logger.warn(`[Identity] ${user.walletAddress} (${user.did || user.id}) reinstated by ${actor?.walletAddress || actor?.id}`);
    return { user: updated, chain };
  },
};

export default identityService;
