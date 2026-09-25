import { ethers } from 'ethers';
import prisma from '../config/db.js';
import chainService from './chain.service.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';

const DEMO_READER_ID = 'DEMO-SIMULATOR';

/**
 * Shared decision + ingest path for a badge tap: evaluates on-chain
 * canAccessZone(), applies the lockdown fail-safe, records the
 * PacsBadgeEvent row, and fires the on-chain audit write. Used by both the
 * machine ingest (evaluateBadgeEvent) and the demo simulator (simulateTap) so
 * the decision logic lives in exactly one place.
 */
async function recordAccessDecision({ readerId, zone, employee, auditActor, auditDetails }) {
  const { zoneId } = zone;

  const chainResult = await chainService.canAccessZoneOnChain({
    walletAddress: employee.walletAddress,
    zoneId,
  });

  let allowed = Boolean(chainResult.allowed);
  let reason = chainResult.reason || '';

  // Defense-in-depth: the on-chain canAccessZone() already encodes the
  // lockdown check (AccessControl.toggleEmergencyLockdown), but the
  // Postgres cache is what our own admin lockdown endpoint (issue #76)
  // writes to synchronously. If the two ever disagree — e.g. the lockdown
  // tx hasn't landed/been read yet — fail safe and deny rather than trust
  // an on-chain "allowed" that may be stale.
  if (employee.revokedAt && allowed) {
    // Same fail-safe for a quarantined identity: the registry is authoritative,
    // but never let a stale "allowed" open a door for someone we know is revoked.
    logger.warn(`[PACS] ${employee.walletAddress} is revoked in Postgres but canAccessZone() returned allowed — denying as a fail-safe.`);
    allowed = false;
    reason = 'IDENTITY_REVOKED';
  } else if (zone.isEmergencyLocked && allowed) {
    logger.warn(
      `[PACS] Zone ${zoneId} is isEmergencyLocked in Postgres but canAccessZone() returned allowed on-chain — denying as a fail-safe.`
    );
    allowed = false;
    reason = 'ZONE_EMERGENCY_LOCKDOWN';
  } else if (!allowed && !reason) {
    reason = 'ACCESS_DENIED';
  }

  const badgeEvent = await prisma.pacsBadgeEvent.create({
    data: {
      readerId,
      zoneId: zone.zoneId,
      employeeId: employee.id,
      decision: allowed ? 'GRANTED' : 'DENIED',
      denialReason: allowed ? null : reason,
    },
  });

  // Fire-and-forget the on-chain audit write (signed by the system
  // connector's own custodial wallet, issue #74, so the resulting
  // AuditEvent is attributable to the machine identity, not a human) —
  // a physical door shouldn't hold the badge holder waiting on a ~12s
  // Sepolia confirmation. The badge event row is backfilled with the tx
  // hash once (if) it lands.
  chainService
    .logAuditEventOnChain({
      eventType: allowed ? 'PACS_ACCESS_GRANTED' : 'PACS_ACCESS_DENIED',
      actor: auditActor,
      target: employee.walletAddress,
      entityId: zoneId,
      details: auditDetails,
      asSystemConnector: true,
    })
    .then(async (chainAudit) => {
      if (chainAudit.confirmed) {
        await prisma.pacsBadgeEvent
          .update({
            where: { id: badgeEvent.id },
            data: {
              onChainTxHash: chainAudit.txHash,
              blockNumber: chainAudit.blockNumber != null ? BigInt(chainAudit.blockNumber) : null,
            },
          })
          .catch((err) =>
            logger.warn(`[PACS] Failed to backfill on-chain tx hash for badge event ${badgeEvent.id}: ${err.message}`)
          );
      }
    })
    .catch((err) => logger.warn(`[PACS] On-chain audit log failed for badge event ${badgeEvent.id}: ${err.message}`));

  return { allowed, reason: allowed ? null : reason, badgeEvent };
}

const zoneView = (zone) => ({
  zoneId: zone.zoneId,
  name: zone.name,
  sbu: zone.sbu,
  requiredClearance: zone.requiredClearance,
  isEmergencyLocked: zone.isEmergencyLocked,
});

// Managers work within their own SBU: they see that SBU's zones plus shared
// (sbu = null) zones, and only that SBU's employees.
const zoneScope = (actor) => {
  if (actor?.role !== 'MANAGER') return {};
  return actor.sbu ? { OR: [{ sbu: actor.sbu }, { sbu: null }] } : { sbu: null };
};

export const pacsService = {
  /**
   * Live PACS zone-access check invoked on every badge tap (issue #75).
   * Called only by the ROLE_SYSTEM_CONNECTOR machine identity.
   */
  async evaluateBadgeEvent({ readerId, zoneId, employeeId }, systemConnector) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const employee = await prisma.user.findUnique({ where: { externalId: employeeId } });
    if (!employee) {
      throw new ApiError(404, `No identity found for employee code ${employeeId}`);
    }

    const zone = await prisma.facilityZone.findUnique({ where: { zoneId } });
    if (!zone) {
      throw new ApiError(404, `Unknown facility zone ${zoneId}`);
    }

    const { allowed, reason, badgeEvent } = await recordAccessDecision({
      readerId,
      zone,
      employee,
      auditActor: systemConnector?.walletAddress,
      auditDetails: JSON.stringify({ readerId, submittedBy: 'machine', source: 'SYSTEM_CONNECTOR' }),
    });

    return {
      allowed,
      reason,
      badgeEventId: badgeEvent.id,
    };
  },

  /**
   * DEMO ONLY — simulated badge tap triggered by a signed-in ADMIN/MANAGER from
   * the browser. Real ingest is machine-only (SYSTEM_CONNECTOR); this runs the
   * exact same decision + ingest path (recordAccessDecision), so the tap is
   * stored as a real PACS event with the real on-chain canAccessZone() result
   * when the contract is configured. The audit details tag it as a simulation.
   */
  async simulateTap({ zoneId, employeeId, walletAddress, readerId }, actor) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    let employee;
    if (employeeId) {
      employee = await prisma.user.findUnique({ where: { id: employeeId } });
    } else {
      let checksum;
      try {
        checksum = ethers.getAddress(walletAddress);
      } catch {
        throw new ApiError(400, 'walletAddress is not a valid address');
      }
      employee = await prisma.user.findUnique({ where: { walletAddress: checksum } });
    }
    if (!employee) {
      throw new ApiError(404, 'No identity found for the selected employee');
    }

    const zone = await prisma.facilityZone.findUnique({ where: { zoneId } });
    if (!zone) {
      throw new ApiError(404, `Unknown facility zone ${zoneId}`);
    }

    if (actor?.role === 'MANAGER') {
      if (!actor.sbu || employee.sbu !== actor.sbu) {
        throw new ApiError(403, 'Managers can only simulate taps for employees in their own SBU');
      }
      if (zone.sbu && zone.sbu !== actor.sbu) {
        throw new ApiError(403, 'Managers can only simulate taps at zones in their own SBU or shared zones');
      }
    }

    const tapReaderId = readerId || DEMO_READER_ID;
    const { allowed, reason, badgeEvent } = await recordAccessDecision({
      readerId: tapReaderId,
      zone,
      employee,
      auditActor: actor?.walletAddress,
      auditDetails: JSON.stringify({
        readerId: tapReaderId,
        submittedBy: 'human',
        source: 'DEMO_SIMULATOR',
        simulatedBy: actor?.id,
      }),
    });

    return {
      simulated: true,
      allowed,
      decision: badgeEvent.decision,
      reason,
      badgeEventId: badgeEvent.id,
      readerId: badgeEvent.readerId,
      scannedAt: badgeEvent.scannedAt,
      zone: zoneView(zone),
      employee: {
        id: employee.id,
        displayName: employee.displayName,
        externalId: employee.externalId,
        sbu: employee.sbu,
        clearanceLevel: employee.clearanceLevel,
      },
    };
  },

  /**
   * Facility zones with their lockdown state (ADMIN/MANAGER/AUDITOR). Managers
   * are scoped to their SBU's zones plus shared zones.
   */
  async listZones(actor) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const zones = await prisma.facilityZone.findMany({
      where: zoneScope(actor),
      orderBy: [{ name: 'asc' }],
    });
    return { zones: zones.map(zoneView) };
  },

  /**
   * Recent badge events, newest first, with employee + zone context. Managers
   * only see events for employees in their own SBU.
   */
  async listEvents({ page, limit, zoneId, decision }, actor) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const where = {};
    if (zoneId) where.zoneId = zoneId;
    if (decision) where.decision = decision;
    if (actor?.role === 'MANAGER') {
      if (!actor.sbu) {
        return { events: [], pagination: { page, limit, total: 0, totalPages: 0 } };
      }
      where.employee = { sbu: actor.sbu };
    }

    const [rows, total] = await Promise.all([
      prisma.pacsBadgeEvent.findMany({
        where,
        orderBy: { scannedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          zone: { select: { name: true } },
          employee: { select: { id: true, displayName: true, externalId: true, sbu: true, clearanceLevel: true } },
        },
      }),
      prisma.pacsBadgeEvent.count({ where }),
    ]);

    const events = rows.map((row) => ({
      id: row.id,
      readerId: row.readerId,
      zoneId: row.zoneId,
      zoneName: row.zone?.name ?? null,
      decision: row.decision,
      denialReason: row.denialReason,
      onChainTxHash: row.onChainTxHash,
      // BigInt does not survive JSON serialization.
      blockNumber: row.blockNumber != null ? Number(row.blockNumber) : null,
      scannedAt: row.scannedAt,
      employee: row.employee,
    }));

    return { events, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  /**
   * Admin-only emergency lockdown toggle (issue #76). Requires the zone to
   * already exist (there is no zone-creation endpoint in scope here).
   */
  async setZoneLockdown(zoneId, locked, adminUser) {
    if (!prisma) throw new ApiError(503, 'Database unavailable');

    const zone = await prisma.facilityZone.findUnique({ where: { zoneId } });
    if (!zone) {
      throw new ApiError(404, `Unknown facility zone ${zoneId} — it must already exist (no zone-creation endpoint in scope)`);
    }

    const chainResult = await chainService.toggleEmergencyLockdownOnChain({ zoneId, status: locked });
    if (!chainResult.confirmed) {
      logger.warn(`Emergency lockdown toggle for zone ${zoneId} applied off-chain only pending on-chain confirmation.`);
    }

    const updated = await prisma.facilityZone.update({
      where: { zoneId },
      data: { isEmergencyLocked: locked },
    });

    logger.info(
      `[PACS] Zone ${zoneId} emergency lockdown ${locked ? 'ENABLED' : 'DISABLED'} by admin ${adminUser?.walletAddress || adminUser?.id}`
    );

    return {
      zoneId: updated.zoneId,
      isEmergencyLocked: updated.isEmergencyLocked,
      chain: chainResult,
    };
  },
};

export default pacsService;
