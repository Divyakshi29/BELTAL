import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import useModalA11y from '../../hooks/useModalA11y';

const SBU_OPTIONS = [
    ['SBU_RADAR', 'Radar'],
    ['SBU_EW', 'Electronic Warfare'],
    ['SBU_MILCOMM', 'Military Communication'],
    ['SBU_CYBER', 'Cyber Security'],
];
const SBU_LABELS = Object.fromEntries(SBU_OPTIONS);

const ROLE_OPTIONS = [
    ['USER', 'User', 'Views their own identity and assets, and can request transfers.'],
    ['MANAGER', 'Manager', "Manages their SBU's team and assets, and approves transfers."],
    ['AUDITOR', 'Auditor', 'Read-only access to the full audit trail and on-chain verification.'],
    ['ADMIN', 'Admin', 'Full administrative control: identities, registrations, minting and zones.'],
];
const CLEARANCE_LEVELS = [1, 2, 3, 4];

const fieldClass =
    'w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:border-[#1E5FA8] focus:ring-1 focus:ring-[#1E5FA8] outline-none disabled:opacity-60';
const labelClass = 'block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1';

const shortWallet = (address = '') => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

function formatSubmitted(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { day: '—', time: '' };
    return {
        day: date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
        time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    };
}

export default function PendingRegistrations() {
    const toast = useToast();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dialog, setDialog] = useState(null); // { mode: 'approve' | 'reject', request }
    const [form, setForm] = useState({ role: 'USER', clearanceLevel: 1, sbu: '', reason: '' });
    const [busy, setBusy] = useState(false);

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await adminApi.listRegistrations({ status: 'PENDING' });
            setRequests(data.registrations || []);
        } catch (err) {
            const message = err.uiMessage || 'Failed to load registration requests';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const openDialog = (mode, request) => {
        setForm({ role: 'USER', clearanceLevel: 1, sbu: request.requestedSbu, reason: '' });
        setDialog({ mode, request });
    };

    const handleConfirm = async () => {
        const { mode, request } = dialog;
        if (mode === 'reject' && !form.reason.trim()) {
            toast.warning('Please provide a reason for rejection');
            return;
        }

        setBusy(true);
        try {
            if (mode === 'approve') {
                await adminApi.approveRegistration(request.id, {
                    role: form.role,
                    clearanceLevel: Number(form.clearanceLevel),
                    sbu: form.sbu,
                });
                toast.success(`${request.fullName} registered as ${form.role}`);
            } else {
                await adminApi.rejectRegistration(request.id, form.reason.trim());
                toast.success(`Request from ${request.fullName} rejected`);
            }
            setRequests((prev) => prev.filter((r) => r.id !== request.id));
            setDialog(null);
            fetchRequests();
        } catch (err) {
            toast.error(err.uiMessage || `Failed to ${mode} request`);
        } finally {
            setBusy(false);
        }
    };

    const copyWallet = async (address) => {
        try {
            await navigator.clipboard.writeText(address);
            toast.success('Wallet address copied');
        } catch {
            toast.warning('Could not copy the address');
        }
    };

    return (
        <div className="min-h-full p-6 sm:p-8 space-y-6 bg-slate-100/60">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="h-px w-12 bg-gradient-to-r from-[#D4AF37]/60 to-transparent" />
                        <span className="text-[10px] font-black tracking-[0.22em] text-[#B8962E] uppercase">
                            RESTRICTED — ADMIN CLEARANCE
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-[#0A1F3D] tracking-wide">Pending Registrations</h1>
                    <p className="text-sm text-slate-600 mt-1">
                        Review self-registration requests and grant a role, clearance and business unit.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={fetchRequests}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#1E5FA8] px-4 py-2 text-xs font-bold text-[#1E5FA8] hover:bg-[#1E5FA8] hover:text-white transition-colors disabled:opacity-50"
                >
                    <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`} aria-hidden="true">
                        refresh
                    </span>
                    Refresh
                </button>
            </div>

            {/* Requests */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
                    <div>
                        <h2 className="text-base font-black uppercase tracking-wider text-[#0A1F3D]">
                            Identity Registration Requests
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Approving registers the identity on-chain and pins its encrypted dossier to IPFS.
                        </p>
                    </div>
                    {!loading && !error && (
                        <span
                            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold border ${
                                requests.length
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}
                        >
                            {requests.length} pending
                        </span>
                    )}
                </div>

                {error && (
                    <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                        <p className="font-bold">Unable to load registration requests</p>
                        <p className="mt-0.5">{error}</p>
                        <button type="button" onClick={fetchRequests} className="mt-2 font-bold underline">
                            Retry
                        </button>
                    </div>
                )}

                {!error && (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-left text-sm">
                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-5 py-3 font-bold">Applicant</th>
                                    <th className="px-4 py-3 font-bold">Wallet</th>
                                    <th className="px-4 py-3 font-bold">Requested SBU</th>
                                    <th className="px-4 py-3 font-bold">Note</th>
                                    <th className="px-4 py-3 font-bold">Submitted</th>
                                    <th className="px-5 py-3 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <tr key={i}>
                                            {Array.from({ length: 6 }).map((__, j) => (
                                                <td key={j} className="px-4 py-4">
                                                    <div className="h-3 w-3/4 rounded bg-slate-200 animate-pulse" />
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : requests.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-4 py-14 text-center">
                                            <span className="material-symbols-outlined block text-[36px] text-slate-300 mb-2" aria-hidden="true">
                                                how_to_reg
                                            </span>
                                            <p className="text-sm font-bold text-slate-600">No pending registration requests</p>
                                            <p className="text-xs text-slate-400 mt-1">New self-registrations will appear here for review.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    requests.map((request) => {
                                        const submitted = formatSubmitted(request.createdAt);
                                        return (
                                            <tr key={request.id} className="align-top hover:bg-slate-50/80 transition-colors">
                                                <td className="px-5 py-4">
                                                    <div className="font-bold text-[#0A1F3D]">{request.fullName}</div>
                                                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">{request.externalId}</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono text-xs text-[#0A1F3D]" title={request.walletAddress}>
                                                            {shortWallet(request.walletAddress)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyWallet(request.walletAddress)}
                                                            aria-label={`Copy wallet address for ${request.fullName}`}
                                                            className="text-slate-400 hover:text-[#1E5FA8] transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                                                                content_copy
                                                            </span>
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="inline-block rounded bg-[#1E5FA8]/10 px-2 py-0.5 text-[11px] font-bold text-[#1E5FA8]">
                                                        {SBU_LABELS[request.requestedSbu] ?? request.requestedSbu}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 max-w-[240px]">
                                                    {request.note ? (
                                                        <p className="text-xs text-slate-600 line-clamp-2" title={request.note}>
                                                            {request.note}
                                                        </p>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 italic">No note</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    <div className="text-xs text-slate-700">{submitted.day}</div>
                                                    <div className="text-[11px] text-slate-400">{submitted.time}</div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => openDialog('approve', request)}
                                                            className="inline-flex items-center gap-1 rounded border border-emerald-600 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">check</span>
                                                            Approve
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openDialog('reject', request)}
                                                            className="inline-flex items-center gap-1 rounded border border-red-500 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">close</span>
                                                            Reject
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {dialog && (
                <DecisionDialog
                    mode={dialog.mode}
                    request={dialog.request}
                    form={form}
                    setForm={setForm}
                    busy={busy}
                    onConfirm={handleConfirm}
                    onClose={() => setDialog(null)}
                />
            )}
        </div>
    );
}

function DecisionDialog({ mode, request, form, setForm, busy, onConfirm, onClose }) {
    // Approval is an on-chain transaction, so don't let Escape/Cancel abandon it midway.
    const dialogRef = useModalA11y(() => {
        if (!busy) onClose();
    });
    const isApprove = mode === 'approve';
    const roleHint = ROLE_OPTIONS.find(([value]) => value === form.role)?.[2];

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="registration-dialog-title"
                className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <span
                            className={`material-symbols-outlined text-xl ${isApprove ? 'text-emerald-600' : 'text-red-600'}`}
                            aria-hidden="true"
                        >
                            {isApprove ? 'how_to_reg' : 'person_off'}
                        </span>
                        <h2 id="registration-dialog-title" className="text-sm font-black text-[#0A1F3D]">
                            {isApprove ? 'Approve Registration' : 'Reject Registration'}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Close dialog"
                        className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                    </button>
                </div>

                <div className="p-4 space-y-4 text-slate-800">
                    <div className="p-2.5 rounded-lg bg-[#0A1F3D]">
                        <div className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-wider">Applicant</div>
                        <div className="text-sm font-bold text-white">{request.fullName}</div>
                        <div className="text-[11px] text-slate-300 font-mono">
                            {request.externalId} · {shortWallet(request.walletAddress)}
                        </div>
                    </div>

                    {isApprove ? (
                        <>
                            <div>
                                <label htmlFor="approve-role" className={labelClass}>Role</label>
                                <select
                                    id="approve-role"
                                    value={form.role}
                                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                                    disabled={busy}
                                    className={fieldClass}
                                >
                                    {ROLE_OPTIONS.map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                {roleHint && <p className="mt-1 text-[11px] text-slate-500">{roleHint}</p>}
                                {form.role === 'ADMIN' && (
                                    <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
                                        This grants full administrative control.
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="approve-clearance" className={labelClass}>Clearance level</label>
                                    <select
                                        id="approve-clearance"
                                        value={form.clearanceLevel}
                                        onChange={(e) => setForm({ ...form, clearanceLevel: e.target.value })}
                                        disabled={busy}
                                        className={fieldClass}
                                    >
                                        {CLEARANCE_LEVELS.map((level) => (
                                            <option key={level} value={level}>Level {level}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="approve-sbu" className={labelClass}>Business unit</label>
                                    <select
                                        id="approve-sbu"
                                        value={form.sbu}
                                        onChange={(e) => setForm({ ...form, sbu: e.target.value })}
                                        disabled={busy}
                                        className={fieldClass}
                                    >
                                        {SBU_OPTIONS.map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {form.sbu !== request.requestedSbu && (
                                <p className="text-[11px] text-slate-500">
                                    Applicant requested {SBU_LABELS[request.requestedSbu] ?? request.requestedSbu}.
                                </p>
                            )}
                            {busy && (
                                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-[#1E5FA8] font-bold animate-pulse">
                                    <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                                    <span>Encrypting dossier, pinning to IPFS, and confirming on Sepolia...</span>
                                </div>
                            )}
                            <p className="text-[11px] text-slate-500">
                                {busy
                                    ? 'Writing to Ethereum Sepolia and IPFS. This can take 15–30 seconds — please keep this window open.'
                                    : 'Approving registers this identity on-chain and pins its encrypted dossier to IPFS.'}
                            </p>
                        </>
                    ) : (
                        <div>
                            <label htmlFor="reject-reason" className={labelClass}>Reason shown to the applicant</label>
                            <textarea
                                id="reject-reason"
                                value={form.reason}
                                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                                placeholder="Explain why this request was rejected…"
                                rows={4}
                                maxLength={500}
                                disabled={busy}
                                className={`${fieldClass} resize-none`}
                                autoFocus
                            />
                            <p className="mt-1 text-right text-[10px] text-slate-400">{form.reason.length}/500</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 p-4 border-t border-slate-200 bg-slate-50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-60 ${
                            isApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                        }`}
                    >
                        {busy ? (
                            <span className="inline-flex items-center justify-center gap-1.5">
                                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                Confirming on-chain...
                            </span>
                        ) : isApprove ? (
                            'Confirm Approve'
                        ) : (
                            'Confirm Reject'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
