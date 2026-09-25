import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { assetApi } from '../../services/api';
import { useTransaction } from '../../context/TransactionContext';
import useModalA11y from '../../hooks/useModalA11y';

// The dialog only exists while open, so its form state resets on every open.
export default function MintAssetModal({ open = true, ...props }) {
  return open ? <MintAssetDialog {...props} /> : null;
}

function MintAssetDialog({ onClose, onSuccess }) {
  const { showPending, showSuccess, showError, removeToast } = useTransaction();
  const dialogRef = useModalA11y(onClose);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    classificationTier: 1,
    sbu: '',
    custodianWallet: '',
    assetTag: '',
    description: '',
  });

  // Prevent parent window scrolling while the modal is mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const pendingId = showPending('Minting asset on blockchain...');
    try {
      const metadata = {};
      if (formData.assetTag.trim()) metadata.assetTag = formData.assetTag.trim();
      if (formData.description.trim()) metadata.description = formData.description.trim();

      await assetApi.mint({
        name: formData.name.trim(),
        classificationTier: Number(formData.classificationTier),
        sbu: formData.sbu,
        ownerWalletAddress: formData.custodianWallet.trim(),
        metadata,
      });
      removeToast(pendingId);
      showSuccess('Asset minted successfully!');
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (err) {
      removeToast(pendingId);
      showError(`Failed to mint asset: ${err.uiMessage || err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mint-asset-title"
        className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#1E5FA8] text-xl" aria-hidden="true">token</span>
            <h2 id="mint-asset-title" className="text-sm font-black text-[#0A1F3D]">Mint Defence Asset</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label htmlFor="mint-name" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Asset Name</label>
            <input
              id="mint-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Sentinel Radar Unit"
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mint-tier" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Classification Tier</label>
              <select
                id="mint-tier"
                value={formData.classificationTier}
                onChange={(e) => setFormData({ ...formData, classificationTier: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
              >
                <option value={1}>Tier 1</option>
                <option value={2}>Tier 2</option>
                <option value={3}>Tier 3</option>
                <option value={4}>Tier 4</option>
              </select>
            </div>
            <div>
              <label htmlFor="mint-sbu" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">SBU</label>
              <select
                id="mint-sbu"
                required
                value={formData.sbu}
                onChange={(e) => setFormData({ ...formData, sbu: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
              >
                <option value="">Select SBU</option>
                <option value="SBU_RADAR">Radar</option>
                <option value="SBU_EW">Electronic Warfare</option>
                <option value="SBU_MILCOMM">Military Comm</option>
                <option value="SBU_CYBER">Cyber Security</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="mint-custodian" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Custodian Wallet Address</label>
            <input
              id="mint-custodian"
              type="text"
              required
              pattern="\s*0x[a-fA-F0-9]{40}\s*"
              title="0x followed by 40 hexadecimal characters"
              value={formData.custodianWallet}
              onChange={(e) => setFormData({ ...formData, custodianWallet: e.target.value })}
              placeholder="0x..."
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mint-tag" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Asset Tag</label>
              <input
                id="mint-tag"
                type="text"
                value={formData.assetTag}
                onChange={(e) => setFormData({ ...formData, assetTag: e.target.value })}
                placeholder="Tag"
                className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
              />
            </div>
            <div>
              <label htmlFor="mint-description" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Description</label>
              <input
                id="mint-description"
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Metadata description"
                className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-md font-bold text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-3 py-2 bg-[#1E5FA8] hover:bg-[#164a85] disabled:bg-slate-300 text-white font-bold rounded-md text-xs transition-colors shadow-sm"
            >
              {submitting ? 'Minting...' : 'Mint Asset'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
