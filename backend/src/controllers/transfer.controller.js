import transferService from '../services/transfer.service.js';

export const transferController = {
  /**
   * POST /api/transfers/request — Request custody handover
   */
  async requestTransfer(req, res, next) {
    try {
      const transferRequest = await transferService.requestTransfer(req.user, req.body);
      return res.status(201).json({
        success: true,
        data: transferRequest,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/transfers — List transfer requests
   */
  async listTransfers(req, res, next) {
    try {
      const { transferRequests, pagination } = await transferService.listTransfers(req.user, req.query);
      return res.status(200).json({
        success: true,
        data: transferRequests,
        pagination,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/transfers/:id/approve — Approve and execute transfer (Admin/Manager)
   */
  async approveTransfer(req, res, next) {
    try {
      const result = await transferService.approveTransfer(req.user, req.params.id);
      return res.status(200).json({
        success: true,
        data: result.transferRequest,
        chain: result.chain,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/transfers/:id/reject — Reject a transfer request
   */
  async rejectTransfer(req, res, next) {
    try {
      const result = await transferService.rejectTransfer(req.user, req.params.id, req.body?.reason);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};

export default transferController;
