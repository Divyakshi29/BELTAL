import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { useAuth } from '../../context/AuthContext';
import useModalA11y from '../../hooks/useModalA11y';
import { RoleBadge, ClearanceBadge } from '../../components/ui/Badge';
import { isChainTxHash } from '../../config/auditEvents';

const SBU_LABELS = {
    SBU_RADAR: 'Radar',
    SBU_EW: 'Electronic Warfare',
    SBU_MILCOMM: 'Military Comm',
    SBU_CYBER: 'Cyber Security',
};

const STATUS_TABS = [
    ['ALL', 'All'],
    ['ACTIVE', 'Active'],
    ['REVOKED', 'Quarantined'],
];

const fieldClass =
    'w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:border-[#1E5FA8] focus:ring-1 focus:ring-[#1E5FA8] outline-none disabled:opacity-60';
const labelClass = 'block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1';

const shortWallet = (address = '') => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

const formatWhen = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// A revoke or reinstate is 1-2 chain transactions, so a mismatch between what
// the chain confirmed and what was requested is worth surfacing, not hiding.
function reportOutcome(toast, verb, name, result) {
    const chain = result?.chain;
    if (chain?.warning) {
        toast.warning(chain.warning);
    } else if (chain && chain.confirmed === false) {
        toast.warning(`${name} ${verb} in the database only. No on-chain transaction was sent because the contracts are not configured on this server.`);
    } else {
        toast.success(`${name} ${verb} and recorded on-chain`);
    }
}

export default function QuarantineStation() {
    const toast = useToast();
    const { user: me } = useAuth();
    const [identities, setIdentities] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState('ALL');
    const [pagination, setPagination] = useState({ page: 1, limit: 20 });
    const [dialog, setDialog] = useState(null); // { mode: 'revoke' | 'reinstate', identity }
    const [reason, setReason] = useState('');
    const [confirmText, setConfirmText] = useState('');
    const [busy, setBusy] = useState(false);

    // Summary tiles reflect the whole registry, not whatever tab/search the
    // table happens to be filtered to right now.
    const [counts, setCounts] = useState({ total: 0, active: 0, revoked: 0 });
    const [countsLoading, setCountsLoading] = useState(true);

    const fetchIdentities = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await adminApi.listIdentities({
                search: search || undefined,
                status: tab === 'ALL' ? undefined : tab,
                page: pagination.page,
                limit: pagination.limit,
            });
            setIdentities(data.users || []);
            setTotal(data.total ?? 0);
        } catch (err) {
            setError(err.uiMessage || 'The identity registry could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [search, tab, pagination.page, pagination.limit]);

    const fetchCounts = useCallback(async () => {
        setCountsLoading(true);
        try {
            const [all, active, revoked] = await Promise.all([
                adminApi.listIdentities({ limit: 1 }),
                adminApi.listIdentities({ limit: 1, status: 'ACTIVE' }),
                adminApi.listIdentities({ limit: 1, status: 'REVOKED' }),
            ]);
            setCounts({ total: all.total ?? 0, active: active.total ?? 0, revoked: revoked.total ?? 0 });
        } catch (err) {
            console.error('Failed to fetch identity counts', err);
        } finally {
            setCountsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchIdentities();
    }, [fetchIdentities]);

    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);

    const refreshAll = useCallback(() => {
        fetchIdentities();
        fetchCounts();
    }, [fetchIdentities, fetchCounts]);

    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

    const updateSearch = (value) => {
        setSearch(value);
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const updateTab = (value) => {
        setTab(value);
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const openDialog = (mode, identity) => {
        setReason('');
        setConfirmText('');
        setDialog({ mode, identity });
    };

    const closeDialog = () => {
        if (!busy) setDialog(null);
    };

    const handleConfirm = async () => {
        const { mode, identity } = dialog;
        const name = identity.displayName || shortWallet(identity.walletAddress);
        setBusy(true);
        try {
            if (mode === 'revoke') {
                const result = await adminApi.revokeIdentity(identity.id, reason.trim());
                reportOutcome(toast, 'revoked', name, result);
            } else {
                const result = await adminApi.reinstateIdentity(identity.id);
                reportOutcome(toast, 'reinstated', name, result);
            }
            setDialog(null);
            refreshAll();
        } catch (err) {
            toast.error(err.uiMessage || `Could not ${mode} this identity`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-full p-6 sm:p-8 space-y-6 bg-slate-100/60">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="h-px w-12 bg-gradient-to-r from-[#D4AF37]/60 to-transparent" />
                        <span className="text-[10px] font-black tracking-[0.22em] text-[#B8962E] uppercase">
                            RESTRICTED · ADMIN CLEARANCE
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-[#0A1F3D] tracking-wide">Quarantine &amp; Revocation</h1>
                    <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                        Revoke an identity to cut its access at once: the DID is deactivated in the IdentityRegistry, its role is
                        removed from AccessControl, and the person is signed out on their next request.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={refreshAll}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#1E5FA8] px-4 py-2 text-xs font-bold text-[#1E5FA8] hover:bg-[#1E5FA8] hover:text-white transition-colors disabled:opacity-50"
                >
                    <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryTile icon="groups" label="Identities" value={counts.total} tone="text-[#1E5FA8] bg-[#1E5FA8]/10" loading={countsLoading} />
                <SummaryTile icon="verified_user" label="Active" value={counts.active} tone="text-emerald-700 bg-emerald-100" loading={countsLoading} />
                <SummaryTile icon="gpp_bad" label="Quarantined" value={counts.revoked} tone="text-red-700 bg-red-100" loading={countsLoading} />
            </div>

            <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
                    <div role="tablist" aria-label="Filter by status" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                        {STATUS_TABS.map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                role="tab"
                                aria-selected={tab === value}
                                onClick={() => updateTab(value)}
                                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                                    tab === value ? 'bg-[#0A1F3D] text-white shadow-sm' : 'text-slate-600 hover:text-[#0A1F3D]'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <input
                        type="search"
                        aria-label="Search identities by name, employee code, DID or wallet"
                        placeholder="Search name, code, DID or wallet…"
                        value={search}
                        onChange={(e) => updateSearch(e.target.value)}
                        className="w-full sm:w-80 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1F3D] placeholder-slate-400 focus:border-[#1E5FA8] outline-none"
                    />
                </div>

                {error && (
                    <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                        <p className="font-bold">Unable to load identities</p>
                        <p className="mt-0.5">{error}</p>
                        <button type="button" onClick={refreshAll} className="mt-2 font-bold underline">Retry</button>
                    </div>
                )}

                {!error && (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px] text-left text-sm">
                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="px-5 py-3 font-bold">Identity</th>
                                    <th className="px-4 py-3 font-bold">Role</th>
                                    <th className="px-4 py-3 font-bold">Clearance</th>
                                    <th className="px-4 py-3 font-bold">SBU</th>
                                    <th className="px-4 py-3 font-bold">Status</th>
                                    <th className="px-5 py-3 font-bold text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <tr key={i}>
                                            {Array.from({ length: 6 }).map((__, j) => (
                                                <td key={j} className="px-4 py-4"><div className="h-3 w-3/4 rounded bg-slate-200 animate-pulse" /></td>
                                            ))}
                                        </tr>
                                    ))
                                ) : identities.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-4 py-14 text-center">
                                            <span className="material-symbols-outlined block text-[36px] text-slate-300 mb-2" aria-hidden="true">shield_person</span>
                                            <p className="text-sm font-bold text-slate-600">No identities match</p>
                                            <p className="text-xs text-slate-400 mt-1">Try a different filter or search term.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    identities.map((identity) => (
                                        <IdentityRow
                                            key={identity.id}
                                            identity={identity}
                                            isSelf={identity.id === me?.id}
                                            onRevoke={() => openDialog('revoke', identity)}
                                            onReinstate={() => openDialog('reinstate', identity)}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {!error && !loading && total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200">
                        <div className="text-[11px] text-slate-500">
                            Showing {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, total)} of {total}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                                disabled={pagination.page === 1}
                                className="px-3 py-1.5 bg-[#1E5FA8] hover:bg-[#164a85] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-bold rounded-lg transition-colors"
                            >
                                Previous
                            </button>
                            <span className="px-2 text-[11px] text-slate-500">
                                Page {pagination.page} of {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                                disabled={pagination.page >= totalPages}
                                className="px-3 py-1.5 bg-[#1E5FA8] hover:bg-[#164a85] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-bold rounded-lg transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {dialog && (
                <ActionDialog
                    mode={dialog.mode}
                    identity={dialog.identity}
                    reason={reason}
                    setReason={setReason}
                    confirmText={confirmText}
                    setConfirmText={setConfirmText}
                    busy={busy}
                    onConfirm={handleConfirm}
                    onClose={closeDialog}
                />
            )}
        </div>
    );
}

function SummaryTile({ icon, label, value, tone, loading }) {
    return (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone}`}>
                <span className="material-symbols-outlined text-[24px]" aria-hidden="true">{icon}</span>
            </span>
            <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                <p className="text-2xl font-black text-[#0A1F3D]">{loading ? '…' : value}</p>
            </div>
        </div>
    );
}

function IdentityRow({ identity, isSelf, onRevoke, onReinstate }) {
    const revoked = Boolean(identity.revokedAt);
    return (
        <tr className={`align-top transition-colors ${revoked ? 'bg-red-50/40' : 'hover:bg-slate-50/80'}`}>
            <td className="px-5 py-3.5">
                <div className="font-bold text-[#0A1F3D]">{identity.displayName || 'Unnamed identity'}</div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-500" title={identity.walletAddress}>
                    {identity.externalId ? `${identity.externalId} · ` : ''}{shortWallet(identity.walletAddress)}
                </div>
            </td>
            <td className="px-4 py-3.5"><RoleBadge role={identity.role} /></td>
            <td className="px-4 py-3.5"><ClearanceBadge level={identity.clearanceLevel} /></td>
            <td className="px-4 py-3.5 text-xs text-slate-600">{SBU_LABELS[identity.sbu] ?? identity.sbu ?? 'N/A'}</td>
            <td className="px-4 py-3.5">
                {revoked ? (
                    <div>
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-red-700">
                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">gpp_bad</span>
                            QUARANTINED
                        </span>
                        <p className="mt-0.5 max-w-[220px] text-[11px] text-slate-600 line-clamp-2" title={identity.revocationReason || ''}>
                            {identity.revocationReason || 'No reason recorded'}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                            {formatWhen(identity.revokedAt)}
                            {isChainTxHash(identity.revokeTxHash) && (
                                <>
                                    {' · '}
                                    <a
                                        href={`https://sepolia.etherscan.io/tx/${identity.revokeTxHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-bold text-[#1E5FA8] underline"
                                    >
                                        on-chain record<span className="sr-only"> (opens in a new tab)</span>
                                    </a>
                                </>
                            )}
                        </p>
                    </div>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        ACTIVE
                    </span>
                )}
            </td>
            <td className="px-5 py-3.5 text-right">
                {revoked ? (
                    <button
                        type="button"
                        onClick={onReinstate}
                        className="inline-flex items-center gap-1 rounded border border-emerald-600 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">lock_open</span>
                        Reinstate
                    </button>
                ) : isSelf ? (
                    <span className="text-[11px] italic text-slate-400" title="You cannot revoke your own identity">This is you</span>
                ) : (
                    <button
                        type="button"
                        onClick={onRevoke}
                        aria-label={`Revoke ${identity.displayName || identity.walletAddress}`}
                        className="inline-flex items-center gap-1 rounded border border-red-500 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                    >
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">block</span>
                        Revoke
                    </button>
                )}
            </td>
        </tr>
    );
}

const CONFIRM_WORD = 'REVOKE';

function ActionDialog({ mode, identity, reason, setReason, confirmText, setConfirmText, busy, onConfirm, onClose }) {
    // Both actions are on-chain transactions; do not let Escape abandon one midway.
    const dialogRef = useModalA11y(onClose);
    const isRevoke = mode === 'revoke';
    const reasonOk = reason.trim().length >= 3;
    const confirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD;
    const canSubmit = !busy && (!isRevoke || (reasonOk && confirmed));
    const name = identity.displayName || shortWallet(identity.walletAddress);

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="quarantine-dialog-title"
                className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[92vh]"
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-xl ${isRevoke ? 'text-red-600' : 'text-emerald-600'}`} aria-hidden="true">
                            {isRevoke ? 'gpp_bad' : 'lock_open'}
                        </span>
                        <h2 id="quarantine-dialog-title" className="text-sm font-black text-[#0A1F3D]">
                            {isRevoke ? 'Revoke identity' : 'Reinstate identity'}
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

                <div className="p-4 space-y-4 text-slate-800 overflow-y-auto">
                    <div className="p-2.5 rounded-lg bg-[#0A1F3D]">
                        <div className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-wider">Identity</div>
                        <div className="text-sm font-bold text-white">{name}</div>
                        <div className="text-[11px] text-slate-300 font-mono break-all">{identity.did || identity.walletAddress}</div>
                    </div>

                    {isRevoke ? (
                        <>
                            <ul className="space-y-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-900">
                                <li className="flex gap-2"><span className="material-symbols-outlined text-[16px]" aria-hidden="true">link_off</span>The DID is deactivated on-chain. Zone access and custody are refused immediately.</li>
                                <li className="flex gap-2"><span className="material-symbols-outlined text-[16px]" aria-hidden="true">key_off</span>The {identity.role} role is removed from the contract, so the wallet can no longer act on-chain.</li>
                                <li className="flex gap-2"><span className="material-symbols-outlined text-[16px]" aria-hidden="true">logout</span>Any open session is rejected on its next request.</li>
                                <li className="flex gap-2"><span className="material-symbols-outlined text-[16px]" aria-hidden="true">inventory_2</span>Assets in their custody stay where they are. Reassign them through a transfer.</li>
                            </ul>
                            <div>
                                <label htmlFor="revoke-reason" className={labelClass}>Reason (written to the audit trail)</label>
                                <textarea
                                    id="revoke-reason"
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="e.g. Left the organisation, lost badge, suspected compromise"
                                    rows={3}
                                    maxLength={200}
                                    disabled={busy}
                                    className={`${fieldClass} resize-none`}
                                    autoFocus
                                />
                                <p className="mt-1 text-right text-[10px] text-slate-400">{reason.length}/200</p>
                            </div>
                            <div>
                                <label htmlFor="revoke-confirm" className={labelClass}>Type {CONFIRM_WORD} to confirm</label>
                                <input
                                    id="revoke-confirm"
                                    type="text"
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    disabled={busy}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className={`${fieldClass} font-mono tracking-widest`}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="space-y-3 text-[12px] text-slate-700">
                            <p>
                                The registry has no undo, so reinstating registers this wallet again with the <strong>same DID, identity hash,
                                clearance ({identity.clearanceLevel}) and SBU</strong>, then grants the {identity.role} role back.
                            </p>
                            <p className="text-slate-500">Reason on record: {identity.revocationReason || 'none'}</p>
                        </div>
                    )}

                    {busy && (
                        <p className="flex items-center gap-2 text-[11px] text-slate-500" role="status">
                            <span className="material-symbols-outlined animate-spin text-[16px]" aria-hidden="true">progress_activity</span>
                            Waiting for the blockchain. This can take up to a minute, so please keep this window open.
                        </p>
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
                        disabled={!canSubmit}
                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            isRevoke ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                    >
                        {busy ? 'Processing…' : isRevoke ? 'Revoke identity' : 'Reinstate identity'}
                    </button>
                </div>
            </div>
        </div>
    );
}
