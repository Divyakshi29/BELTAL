import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTransaction } from '../../context/TransactionContext';
import { useFormValidation } from '../../hooks/useFormValidation'; // NEW: Validation Hook
import { assetApi, userApi, transferApi } from '../../services/api';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

export default function RequestTransferForm() {
  const { user } = useAuth();
  const { showPending, showSuccess, showError, removeToast } = useTransaction();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedAssetId = searchParams.get('asset');

  const [assets, setAssets] = useState([]);
  const [identities, setIdentities] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadProblem, setLoadProblem] = useState('');

  const [formData, setFormData] = useState({
    assetId: preselectedAssetId || '',
    toUserId: '',
    reason: '',
  });

  // NEW: Initialize form validation
  const { errors, touched, validateForm, handleBlur, clearErrors } = useFormValidation();

  // Validation Rules
  const validationRules = {
    assetId: { required: true, label: 'Asset' },
    toUserId: { required: true, label: 'Recipient' },
    reason: { minLength: 5, label: 'Reason' }, // Optional, but validates if length < 5
  };

  const loadData = useCallback(async () => {
    setLoadProblem('');
    const [assetsResult, recipientsResult] = await Promise.allSettled([
      assetApi.listMine(),
      userApi.listTransferRecipients({ limit: 100, custodyOnly: true }),
    ]);

    if (assetsResult.status === 'fulfilled') {
      const data = assetsResult.value;
      setAssets(Array.isArray(data) ? data : data?.assets || []);
    } else {
      setAssets([]);
    }

    if (recipientsResult.status === 'fulfilled') {
      const data = recipientsResult.value;
      setIdentities(data?.users || (Array.isArray(data) ? data : []));
    } else {
      setIdentities([]);
    }

    if (assetsResult.status === 'rejected' || recipientsResult.status === 'rejected') {
      setLoadProblem('Some transfer options are temporarily unavailable. Please refresh in a moment or contact your administrator.');
    }
  }, []);

  useEffect(() => {
    if (user?.walletAddress) {
      loadData();
    }
  }, [user?.walletAddress, loadData]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // NEW: Validate form before submitting
    const isValid = validateForm(formData, validationRules);
    if (!isValid) {
      showError("Please fix the form errors before submitting.");
      return;
    }

    setSubmitting(true);
    const pendingId = showPending('Submitting transfer request to blockchain...');

    try {
      await transferApi.create({
        assetId: formData.assetId,
        toUserId: formData.toUserId,
        reason: formData.reason || 'Transfer request',
      });

      removeToast(pendingId);
      showSuccess('Transfer request submitted successfully! Awaiting approval.');
      navigate('/dashboard');
    } catch (err) {
      removeToast(pendingId);
      console.error("Failed to create transfer", err);
      showError(`Failed to submit request: ${err.uiMessage || err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAsset = assets.find((a) => a.id === formData.assetId);
  const selectedRecipient = identities.find((u) => u.id === formData.toUserId);

  return (
    <div className="user-console min-h-full p-6 sm:p-8 max-w-none space-y-6">
      <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="h-px w-12 bg-gradient-to-r from-emerald-500/40 to-transparent" />
          <span className="text-[9px] font-black tracking-[0.22em] text-emerald-500/60 uppercase">
            REGISTERED PERSONNEL — TRANSFER REQUEST
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide">Request Asset Transfer</h1>
        <p className="text-sm text-slate-400 mt-1">
          Submit a transfer request for manager / admin approval
        </p>
      </div>

      <Card goldAccent={false}>
        <CardHeader>
          <CardTitle>Transfer Request Form</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">

            {loadProblem && (
              <div className="flex items-start gap-3 rounded-xl border border-[#A9CDEB] bg-[#E8F4FF]/80 px-4 py-3 text-[#38536E]">
                <span className="material-symbols-outlined text-[#1E5FA8]">info</span>
                <p className="text-xs leading-5">{loadProblem}</p>
              </div>
            )}

            {/* Asset Selection */}
            <div>
              <label htmlFor="request-asset" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Select Asset to Transfer *
              </label>
              <select
                id="request-asset"
                required
                value={formData.assetId}
                onChange={(e) => {
                  setFormData({ ...formData, assetId: e.target.value });
                  clearErrors('assetId');
                }}
                onBlur={() => handleBlur('assetId')}
                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
              >
                <option value="">-- Select an Asset --</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id} disabled={Boolean(asset.pendingTransfer)}>
                    {asset.name} (Tier {asset.classificationTier}){asset.pendingTransfer ? ' - Transfer pending' : ''}
                  </option>
                ))}
              </select>
              {touched.assetId && errors.assetId && (
                <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  {errors.assetId.join(', ')}
                </p>
              )}
              {assets.length === 0 && !touched.assetId && (
                <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  You don't have any assets to transfer
                </p>
              )}
            </div>

            {/* Selected Asset Details */}
            {selectedAsset && (
              <div className="p-4 rounded-lg bg-[#0D1F38] border border-emerald-700/50 animate-fade-in">
                <h3 className="text-sm font-bold text-emerald-400 mb-3">Selected Asset Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Name:</span>
                    <span className="text-white ml-2 font-medium">{selectedAsset.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Classification:</span>
                    <span className="text-white ml-2 font-medium">Tier {selectedAsset.classificationTier}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Custody status:</span>
                    <span className={`ml-2 font-medium ${selectedAsset.pendingTransfer ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {selectedAsset.pendingTransfer ? 'Transfer pending' : 'In your custody'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">SBU:</span>
                    <span className="text-white ml-2 font-medium">{selectedAsset.sbu?.replace('SBU_', '') || 'N/A'}</span>
                  </div>
                </div>
                {selectedAsset.pendingTransfer && (
                  <div className="mt-3 p-3 rounded bg-amber-900/30 border border-amber-600/50">
                    <p className="text-amber-400 text-xs font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">warning</span>
                      Transfer already pending
                    </p>
                    <p className="text-amber-300/80 text-xs mt-1">
                      This asset already has a transfer request awaiting approval. Choose a different asset, or wait for that request to be resolved.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Recipient Selection */}
            <div>
              <label htmlFor="request-recipient" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Transfer To (Recipient) *
              </label>
              <select
                id="request-recipient"
                required
                value={formData.toUserId}
                onChange={(e) => {
                  setFormData({ ...formData, toUserId: e.target.value });
                  clearErrors('toUserId');
                }}
                onBlur={() => handleBlur('toUserId')}
                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
              >
                <option value="">-- Select Recipient --</option>
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.displayName || 'Unknown'}{identity.role ? ` (${identity.role})` : ''} - Level {identity.clearanceLevel}
                  </option>
                ))}
              </select>
              {touched.toUserId && errors.toUserId && (
                <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  {errors.toUserId.join(', ')}
                </p>
              )}
            </div>

            {/* Selected Recipient Details */}
            {selectedRecipient && (
              <div className="p-4 rounded-lg bg-[#0D1F38] border border-emerald-700/50 animate-fade-in">
                <h3 className="text-sm font-bold text-emerald-400 mb-3">Recipient Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Name:</span>
                    <span className="text-white ml-2 font-medium">{selectedRecipient.displayName || 'Unknown'}</span>
                  </div>
                  {selectedRecipient.role && (
                    <div>
                      <span className="text-slate-500">Role:</span>
                      <span className="text-white ml-2 font-medium">{selectedRecipient.role}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500">Clearance:</span>
                    <span className="text-white ml-2 font-medium">Level {selectedRecipient.clearanceLevel}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">SBU:</span>
                    <span className="text-white ml-2 font-medium">{selectedRecipient.sbu?.replace('SBU_', '') || 'N/A'}</span>
                  </div>
                  {selectedRecipient.walletAddress && (
                    <div className="col-span-1 sm:col-span-2">
                      <span className="text-slate-500">Wallet:</span>
                      <div className="text-slate-400 font-mono text-[10px] mt-0.5 break-all">
                        {selectedRecipient.walletAddress}
                      </div>
                    </div>
                  )}
                </div>

                {selectedAsset && selectedRecipient.clearanceLevel < (selectedAsset.classificationTier || 0) && (
                  <div className="mt-3 p-3 rounded bg-amber-900/30 border border-amber-600/50">
                    <p className="text-amber-400 text-xs font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">warning</span>
                      Clearance Level Warning
                    </p>
                    <p className="text-amber-300/80 text-xs mt-1">
                      The recipient's clearance level ({selectedRecipient.clearanceLevel}) is lower than
                      the asset's classification tier ({selectedAsset.classificationTier}).
                      This request may require additional approval.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Reason Textarea */}
            <div>
              <label htmlFor="request-reason" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Reason for Transfer
              </label>
              <textarea
                id="request-reason"
                value={formData.reason}
                onChange={(e) => {
                  setFormData({ ...formData, reason: e.target.value });
                  clearErrors('reason');
                }}
                onBlur={() => handleBlur('reason')}
                placeholder="Enter reason for this transfer (optional but recommended)"
                rows={4}
                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none resize-none transition-colors"
              />
              {touched.reason && errors.reason && (
                <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  {errors.reason.join(', ')}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Provide a clear reason to help expedite approval
              </p>
            </div>

            {/* Submit Buttons (Responsive) */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="flex-1 px-4 py-3 border border-[#1F293D] text-slate-400 hover:text-white hover:bg-white/5 rounded font-bold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !formData.assetId || !formData.toUserId || Boolean(selectedAsset?.pendingTransfer)}
                title={selectedAsset?.pendingTransfer ? 'This asset already has a pending transfer request' : (!formData.assetId || !formData.toUserId ? 'Select an asset and recipient to submit this request' : 'Submit transfer request')}
                className="flex-1 px-4 py-3 rounded-xl bg-[#1E5FA8] hover:bg-[#164a85] disabled:bg-[#D9E8F7] disabled:text-[#58718B] disabled:border disabled:border-[#B9DCEF] disabled:cursor-not-allowed disabled:opacity-100 text-white font-black uppercase tracking-widest shadow-[0_7px_16px_rgba(30,95,168,0.20)] disabled:shadow-none transition-all flex items-center justify-center gap-2"
              >
                {submitting && (
                  <span className="material-symbols-outlined text-[18px] animate-spin">hourglass_top</span>
                )}
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card goldAccent={false}>
        <CardContent>
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-emerald-400 text-[20px] mt-0.5 shrink-0">
              info
            </span>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-white mb-1">How Transfer Requests Work</h3>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Submit this form to create a transfer request</li>
                <li>• Your manager or admin will review the request</li>
                <li>• Upon approval, ownership will be transferred on-chain</li>
                <li>• You can track the status in your dashboard</li>
                <li>• Cross-SBU transfers may require additional clearance</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
