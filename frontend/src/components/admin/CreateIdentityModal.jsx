import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { adminApi } from '../../services/api';
import { useTransaction } from '../../context/TransactionContext';
import useModalA11y from '../../hooks/useModalA11y';

// The dialog only exists while open, so its form state resets on every open.
export default function CreateIdentityModal({ open = true, ...props }) {
  return open ? <CreateIdentityDialog {...props} /> : null;
}

function CreateIdentityDialog({ onClose, onSuccess }) {
  const { showPending, showSuccess, showError, removeToast } = useTransaction();
  const dialogRef = useModalA11y(onClose);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    walletAddress: '',
    externalId: '',
    fullName: '',
    role: 'USER',
    clearanceLevel: 1,
    sbu: '',
  });

  // Lock background scrolling while the modal is mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const pendingId = showPending('Provisioning identity on ledger...');
    try {
      await adminApi.registerIdentity({
        ...formData,
        walletAddress: formData.walletAddress.trim(),
        externalId: formData.externalId.trim(),
        fullName: formData.fullName.trim(),
        displayName: formData.fullName.trim(),
        clearanceLevel: Number(formData.clearanceLevel),
      });
      removeToast(pendingId);
      showSuccess('Identity provisioned successfully!');
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (err) {
      removeToast(pendingId);
      showError(`Failed to register identity: ${err.uiMessage || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-identity-title"
        className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#1E5FA8] text-xl" aria-hidden="true">person_add</span>
            <h2 id="create-identity-title" className="text-sm font-black text-[#0A1F3D]">Register Sovereign Identity</h2>
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
            <label htmlFor="identity-wallet" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Wallet Address / DID
            </label>
            <input
              id="identity-wallet"
              type="text"
              required
              pattern="\s*0x[a-fA-F0-9]{40}\s*"
              title="0x followed by 40 hexadecimal characters"
              value={formData.walletAddress}
              onChange={(e) => setFormData({ ...formData, walletAddress: e.target.value })}
              placeholder="0x..."
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] focus:bg-white outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="identity-employee-id" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Employee ID
              </label>
              <input
                id="identity-employee-id"
                type="text"
                required
                value={formData.externalId}
                onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
                placeholder="e.g. BEL-10234"
                className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] focus:bg-white outline-none transition-colors"
              />
            </div>

            <div>
              <label htmlFor="identity-name" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <input
                id="identity-name"
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="e.g. Sarah Vance"
                className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] focus:bg-white outline-none transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="identity-role" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Role
              </label>
              <select
                id="identity-role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] focus:bg-white outline-none transition-colors"
              >
                <option value="USER">USER</option>
                <option value="MANAGER">MANAGER</option>
                <option value="AUDITOR">AUDITOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>

            <div>
              <label htmlFor="identity-clearance" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Clearance Level
              </label>
              <select
                id="identity-clearance"
                value={formData.clearanceLevel}
                onChange={(e) => setFormData({ ...formData, clearanceLevel: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] focus:bg-white outline-none transition-colors"
              >
                <option value={1}>Tier 1 — Basic</option>
                <option value={2}>Tier 2 — Confidential</option>
                <option value={3}>Tier 3 — Secret</option>
                <option value={4}>Tier 4 — Top Secret</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="identity-sbu" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Strategic Business Unit (SBU)
            </label>
            <select
              id="identity-sbu"
              required
              value={formData.sbu}
              onChange={(e) => setFormData({ ...formData, sbu: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] focus:bg-white outline-none transition-colors"
            >
              <option value="">Select SBU</option>
              <option value="SBU_RADAR">Radar</option>
              <option value="SBU_EW">Electronic Warfare</option>
              <option value="SBU_MILCOMM">Military Comm</option>
              <option value="SBU_CYBER">Cyber Security</option>
            </select>
          </div>

          {/* Form Actions */}
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
              disabled={loading}
              className="flex-1 px-3 py-2 bg-[#1E5FA8] hover:bg-[#164a85] disabled:bg-slate-300 text-white font-bold rounded-md text-xs transition-colors shadow-sm"
            >
              {loading ? 'Provisioning...' : 'Provision Identity'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
