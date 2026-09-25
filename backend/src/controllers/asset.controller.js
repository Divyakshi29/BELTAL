import assetService from '../services/asset.service.js';

export const assetController = {
  /**
   * POST /api/assets — Mint a new asset NFT and assign custody (Admin/Manager)
   */
  async mintAsset(req, res, next) {
    try {
      const result = await assetService.mintAsset(req.user, req.body);
      return res.status(201).json({
        success: true,
        data: result.asset,
        chain: result.chain,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/assets/me (or /api/assets/my) — List assets in caller's custody
   */
  async getMyAssets(req, res, next) {
    try {
      const assets = await assetService.getMyAssets(req.user);
      return res.status(200).json({
        success: true,
        data: assets,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/assets/:id — Fetch one asset's details plus custody history
   */
  async getAssetById(req, res, next) {
    try {
      const asset = await assetService.getAssetById(req.params.id, req.user);
      return res.status(200).json({
        success: true,
        data: asset,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/assets — List / search all assets (Admin / Manager / Auditor)
   */
  async listAssets(req, res, next) {
    try {
      const { assets, pagination } = await assetService.listAssets(req.user, req.query);
      return res.status(200).json({
        success: true,
        data: assets,
        pagination,
      });
    } catch (err) {
      next(err);
    }
  },
};

export default assetController;
