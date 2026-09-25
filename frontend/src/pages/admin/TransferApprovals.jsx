import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { transferApi } from '../../services/api';
import { useTransaction } from '../../context/TransactionContext';
import { useAuth } from '../../context/AuthContext';
import useModalA11y from '../../hooks/useModalA11y';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

export default function TransferApprovals() {
    const navigate = useNavigate();
    const { showSuccess, showError } = useTransaction();
    const { user } = useAuth();
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [processing, setProcessing] = useState(null);
    const [rejectModal, setRejectModal] = useState({ open: false, transferId: null, reason: '' });

    const fetchTransfers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await transferApi.list({ status: 'PENDING', limit: 100 });
            setTransfers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Failed to fetch transfers", err);
            setError(err.uiMessage || 'Transfer requests could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTransfers();
    }, [fetchTransfers]);

    const handleApprove = async (id) => {
        if (!confirm('Approve this transfer? This will execute the on-chain custody reassignment.')) {
            return;
        }

        setProcessing(id);
        try {
            await transferApi.approve(id);
            showSuccess('Transfer approved and executed on-chain!');
            fetchTransfers();
        } catch (err) {
            console.error("Approval failed", err);
            showError("Failed to approve: " + (err.uiMessage || err.message));
        } finally {
            setProcessing(null);
        }
    };

    const handleRejectClick = (id) => {
        setRejectModal({ open: true, transferId: id, reason: '' });
    };

    const closeRejectModal = useCallback(() => {
        setRejectModal({ open: false, transferId: null, reason: '' });
    }, []);

    const handleReject = async () => {
        if (!rejectModal.reason.trim()) {
            showError('Please provide a reason for rejection');
            return;
        }

        setProcessing(rejectModal.transferId);
        try {
            await transferApi.reject(rejectModal.transferId, { reason: rejectModal.reason.trim() });
            showSuccess('Transfer request rejected');
            closeRejectModal();
            fetchTransfers();
        } catch (err) {
            console.error("Rejection failed", err);
            showError("Failed to reject: " + (err.uiMessage || err.message));
        } finally {
            setProcessing(null);
        }
    };

    return (
        <div className="role-console min-h-full p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="h-px w-12 bg-gradient-to-r from-[#D4AF37]/40 to-transparent" />
                        <span className="text-[9px] font-black tracking-[0.22em] text-[#D4AF37]/60 uppercase">
                            ◈ RESTRICTED — ADMIN/MANAGER CLEARANCE
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-wide">Pending Transfer Approvals</h1>
                </div>

                {/* Managers oversee one SBU, so "their team" maps onto /team-assets. An
                    admin has no SBU of their own to manage — /team-assets would just
                    filter by whatever SBU the admin happens to be registered under,
                    which isn't "their team" in any meaningful sense — so admins get
                    the unrestricted, all-SBU asset registry instead. */}
                <button
                    type="button"
                    onClick={() => navigate(user?.role === 'ADMIN' ? '/admin/assets' : '/team-assets')}
                    className="px-4 py-2 bg-[#1E5FA8] hover:bg-[#164a85] text-white text-xs font-bold rounded transition-colors"
                >
                    {user?.role === 'ADMIN' ? 'View Asset Registry' : 'View Team Assets'}
                </button>
            </div>

            <Card goldAccent={false}>
                <CardHeader>
                    <CardTitle>Custody Transfer Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="mb-4 rounded-lg border border-red-500/40 p-4 text-sm text-red-400" role="alert">
                            <p className="font-bold">Unable to load transfer requests</p>
                            <p className="mt-1 text-xs">{error}</p>
                            <button type="button" onClick={fetchTransfers} className="mt-3 text-xs font-bold underline">Retry</button>
                        </div>
                    )}
                    {loading ? (
                        <p className="text-slate-400 text-center py-8">Loading transfer requests...</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="text-xs uppercase text-[#D4AF37] border-b border-[#1F293D]">
                                    <tr>
                                        <th className="px-4 py-3">Asset</th>
                                        <th className="px-4 py-3">From (Current)</th>
                                        <th className="px-4 py-3">To (New Custodian)</th>
                                        <th className="px-4 py-3">Requested By</th>
                                        <th className="px-4 py-3">Reason</th>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1F293D]">
                                    {transfers.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                                                No pending transfer requests
                                            </td>
                                        </tr>
                                    ) : (
                                        transfers.map((transfer) => (
                                            <tr key={transfer.id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-4 py-3 font-medium text-white">
                                                    {transfer.asset?.name || 'Unknown Asset'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-xs">
                                                        <div className="text-white font-medium">
                                                            {transfer.fromUser?.displayName || 'Unknown'}
                                                        </div>
                                                        <div className="text-slate-400 font-mono text-[10px]">
                                                            {transfer.fromUser?.walletAddress?.slice(0, 6)}...
                                                            {transfer.fromUser?.walletAddress?.slice(-4)}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-xs">
                                                        <div className="text-white font-medium">
                                                            {transfer.toUser?.displayName || 'Unknown'}
                                                        </div>
                                                        <div className="text-slate-400 font-mono text-[10px]">
                                                            {transfer.toUser?.walletAddress?.slice(0, 6)}...
                                                            {transfer.toUser?.walletAddress?.slice(-4)}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs">
                                                    {transfer.requestedBy?.displayName || 'Unknown'}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px] truncate">
                                                    {transfer.reason || 'N/A'}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-400">
                                                    {new Date(transfer.createdAt).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {user?.id && (transfer.requestedById ?? transfer.requestedBy?.id) === user.id ? (
                                                        <span className="inline-block rounded bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-400 italic">
                                                            Requester cannot self-approve (Requires approver review)
                                                        </span>
                                                    ) : (
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApprove(transfer.id)}
                                                            disabled={processing === transfer.id}
                                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
                                                        >
                                                            {processing === transfer.id ? 'Processing...' : 'Approve'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRejectClick(transfer.id)}
                                                            disabled={processing === transfer.id}
                                                            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
                                                        >
                                                            {processing === transfer.id ? 'Processing...' : 'Reject'}
                                                        </button>
                                                    </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Reject Modal */}
            {rejectModal.open && (
                <RejectDialog
                    reason={rejectModal.reason}
                    processing={processing === rejectModal.transferId}
                    onReasonChange={(reason) => setRejectModal(prev => ({ ...prev, reason }))}
                    onConfirm={handleReject}
                    onClose={closeRejectModal}
                />
            )}
        </div>
    );
}

function RejectDialog({ reason, processing, onReasonChange, onConfirm, onClose }) {
    const dialogRef = useModalA11y(onClose);

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reject-transfer-title"
                className="bg-[#0D1F38] border border-[#1F293D] rounded-lg max-w-md w-full p-6 space-y-4"
            >
                <h2 id="reject-transfer-title" className="text-xl font-black text-white">Reject Transfer Request</h2>
                <label htmlFor="reject-reason" className="block text-sm text-slate-400">
                    Please provide a reason for rejecting this transfer request:
                </label>
                <textarea
                    id="reject-reason"
                    value={reason}
                    onChange={(e) => onReasonChange(e.target.value)}
                    placeholder="Enter rejection reason..."
                    rows={4}
                    className="w-full bg-[#060D1A] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-red-500 outline-none resize-none"
                />
                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-[#1F293D] text-slate-400 hover:text-[#0D2B4E] hover:bg-black/5 rounded font-bold text-sm transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={processing}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded transition-colors disabled:opacity-50"
                    >
                        {processing ? 'Rejecting...' : 'Confirm Reject'}
                    </button>
                </div>
            </div>
        </div>
    );
}
