import pacsService from '../services/pacs.service.js';

export const pacsController = {
  /**
   * POST /api/pacs/badge-event — live zone-access check on every badge tap
   * (issue #75). Restricted to the ROLE_SYSTEM_CONNECTOR machine identity.
   */
  async badgeEvent(req, res, next) {
    try {
      const result = await pacsService.evaluateBadgeEvent(req.body, req.user);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/pacs/simulate-tap — DEMO ONLY. A signed-in ADMIN/MANAGER taps a
   * badge on behalf of an employee from the simulator UI; runs the same
   * decision + ingest path as the machine endpoint above.
   */
  async simulateTap(req, res, next) {
    try {
      const result = await pacsService.simulateTap(req.body, req.user);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/pacs/zones — facility zones incl. required clearance/SBU and
   * lockdown state (ADMIN/MANAGER/AUDITOR).
   */
  async listZones(req, res, next) {
    try {
      const result = await pacsService.listZones(req.user);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/pacs/events — recent badge events, newest first, paginated
   * (ADMIN/MANAGER/AUDITOR).
   */
  async listEvents(req, res, next) {
    try {
      const result = await pacsService.listEvents(req.query, req.user);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/pacs/zones/:zoneId/lockdown — admin emergency lockdown toggle
   * (issue #76).
   */
  async setZoneLockdown(req, res, next) {
    try {
      const result = await pacsService.setZoneLockdown(req.params.zoneId, req.body.locked, req.user);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};

export default pacsController;
