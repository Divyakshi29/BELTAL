import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApi, recoveryApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { RoleBadge } from '../../components/ui/Badge';
import { isChainTxHash } from '../../config/auditEvents';

const STATUS_STYLE = {
    PENDING: { label: 'Awaiting guardians', tone: 'bg-amber-50 text-amber-800 border-amber-200', icon: 'hourglass_top' },
    APPROVED: { label: 'Ready to execute', tone: 'bg-blue-50 text-blue-800 border-blue-200', icon: 'task_alt' },
    COMPLETED: { label: 'Completed', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: 'verified' },
    REJECTED: { label: 'Rejected', tone: 'bg-red-50 text-red-800 border-red-200', icon: 'cancel' },
};
const STATUS_FILTERS = [['', 'All requests'], ['PENDING', 'Awaiting guardians'], ['APPROVED', 'Ready to execute'], ['COMPLETED', 'Completed'], ['REJECTED', 'Rejected']];
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const fieldClass =
    'w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:border-[#1E5FA8] focus:ring-1 focus:ring-[#1E5FA8] outline-none disabled:opacity-60';
const labelClass = 'block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1';

const shortWallet = (address = '') => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);
const formatWhen = (value) =>
    new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function RecoveryCenter() {
    const toast = useToast();
    const [tab, setTab] = useState('requests');
    const [identities, setIdentities] = useState([]);

    useEffect(() => {
        adminApi
            .listIdentities({ limit: 100 })
            .then((data) => setIdentities(data.users || []))
            .catch((err) => toast.error(err.uiMessage || 'The identity list could not be loaded'));
    }, [toast]);

    return (
        <div className="min-h-full p-6 sm:p-8 space-y-6 bg-slate-100/60">
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="h-px w-12 bg-gradient-to-r from-[#D4AF37]/60 to-transparent" />
                    <span className="text-[10px] font-black tracking-[0.22em] text-[#B8962E] uppercase">
                        RESTRICTED · ADMIN CLEARANCE
                    </span>
                </div>
                <h1 className="text-2xl font-black text-[#0A1F3D] tracking-wide">Account Recovery</h1>
                <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                    When someone loses their wallet, their guardians vouch for a replacement. Once enough have approved, executing
                    the recovery retires the old wallet on-chain and re-anchors the same DID to the new one.
                </p>
            </div>

            <div role="tablist" aria-label="Recovery sections" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                {[['requests', 'Recovery requests', 'manage_history'], ['guardians', 'Guardians', 'shield_person']].map(([value, label, icon]) => (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={tab === value}
                        onClick={() => setTab(value)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-bold transition-colors ${
                            tab === value ? 'bg-[#0A1F3D] text-white shadow-sm' : 'text-slate-600 hover:text-[#0A1F3D]'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{icon}</span>
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'requests' ? <RequestsPanel identities={identities} /> : <GuardiansPanel identities={identities} />}
        </div>
    );
}

/* ── Requests ────────────────────────────────────────────── */

function RequestsPanel({ identities }) {
    const toast = useToast();
    const [status, setStatus] = useState('');
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [details, setDetails] = useState({});
    const [newOpen, setNewOpen] = useState(false);
    const [action, setAction] = useState(null); // { type: 'reject' | 'execute', request }
    const [rejectReason, setRejectReason] = useState('');
    const [busy, setBusy] = useState(false);

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRequests(await recoveryApi.list(status ? { status } : {}));
        } catch (err) {
            setError(err.uiMessage || 'Recovery requests could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const loadDetail = useCallback(async (id) => {
        try {
            const detail = await recoveryApi.get(id);
            setDetails((prev) => ({ ...prev, [id]: detail }));
        } catch (err) {
            toast.error(err.uiMessage || 'The request details could not be loaded');
        }
    }, [toast]);

    const toggle = (id) => {
        if (expanded === id) {
            setExpanded(null);
            return;
        }
        setExpanded(id);
        loadDetail(id);
    };

    const refreshAfterChange = (id) => {
        fetchRequests();
        if (id) loadDetail(id);
    };

    const handleApprove = async (request) => {
        setBusy(true);
        try {
            await recoveryApi.approve(request.id);
            toast.success('Your approval is recorded');
            refreshAfterChange(request.id);
        } catch (err) {
            toast.error(err.uiMessage || 'The approval could not be recorded');
        } finally {
            setBusy(false);
        }
    };

    const handleActionConfirm = async () => {
        const { type, request } = action;
        setBusy(true);
        try {
            if (type === 'reject') {
                await recoveryApi.reject(request.id, rejectReason.trim());
                toast.success('Recovery request rejected');
            } else {
                await recoveryApi.execute(request.id);
                toast.success('Recovery executed: the identity now lives on the new wallet');
            }
            setAction(null);
            setRejectReason('');
            refreshAfterChange(request.id);
        } catch (err) {
            toast.error(err.uiMessage || `The recovery could not be ${type === 'reject' ? 'rejected' : 'executed'}`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" aria-label="Recovery requests">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-3">
                    <label htmlFor="recovery-status" className="sr-only">Filter by status</label>
                    <select
                        id="recovery-status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#0A1F3D] focus:border-[#1E5FA8] outline-none"
                    >
                        {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <button
                        type="button"
                        onClick={fetchRequests}
                        disabled={loading}
                        aria-label="Refresh requests"
                        className="text-slate-400 hover:text-[#1E5FA8] transition-colors disabled:opacity-50"
                    >
                        <span className={`material-symbols-outlined text-[20px] ${loading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => setNewOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#1E5FA8] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#164a85]"
                >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
                    New recovery request
                </button>
            </div>

            {error && (
                <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                    <p className="font-bold">Unable to load requests</p>
                    <p className="mt-0.5">{error}</p>
                    <button type="button" onClick={fetchRequests} className="mt-2 font-bold underline">Retry</button>
                </div>
            )}

            {!error && loading && (
                <div className="space-y-3 p-5">
                    {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />)}
                </div>
            )}

            {!error && !loading && requests.length === 0 && (
                <div className="px-6 py-14 text-center">
                    <span className="material-symbols-outlined block text-[38px] text-slate-300 mb-2" aria-hidden="true">key</span>
                    <p className="text-sm font-bold text-slate-600">No recovery requests</p>
                    <p className="text-xs text-slate-400 mt-1">Start one when someone loses access to their wallet.</p>
                </div>
            )}

            {!error && !loading && requests.length > 0 && (
                <ul className="divide-y divide-slate-100 ui-stagger">
                    {requests.map((request, index) => {
                        const style = STATUS_STYLE[request.status] ?? STATUS_STYLE.PENDING;
                        const detail = details[request.id];
                        const open = expanded === request.id;
                        return (
                            <li key={request.id} style={{ '--i': index }}>
                                <button
                                    type="button"
                                    onClick={() => toggle(request.id)}
                                    aria-expanded={open}
                                    className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-[#0A1F3D]">
                                            {request.user?.displayName || 'Unnamed identity'}
                                            {request.user?.externalId && <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">{request.user.externalId}</span>}
                                        </p>
                                        <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                                            {shortWallet(request.oldWalletAddress || request.user?.walletAddress)} → {shortWallet(request.newWalletAddress)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-bold text-slate-500">{request.approvalCount} approval{request.approvalCount === 1 ? '' : 's'}</span>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-black ${style.tone}`}>
                                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{style.icon}</span>
                                            {style.label}
                                        </span>
                                        <span className={`material-symbols-outlined text-[20px] text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">expand_more</span>
                                    </div>
                                </button>

                                {open && (
                                    <RequestDetail
                                        request={request}
                                        detail={detail}
                                        busy={busy}
                                        onApprove={() => handleApprove(request)}
                                        onReject={() => { setRejectReason(''); setAction({ type: 'reject', request }); }}
                                        onExecute={() => setAction({ type: 'execute', request })}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {newOpen && (
                <NewRequestDialog
                    identities={identities}
                    onClose={() => setNewOpen(false)}
                    onCreated={() => { setNewOpen(false); fetchRequests(); }}
                />
            )}

            {action?.type === 'reject' && (
                <ConfirmDialog
                    title="Reject recovery"
                    icon="cancel"
                    tone="danger"
                    confirmLabel="Reject request"
                    busy={busy}
                    disabled={rejectReason.trim().length < 3}
                    busyText="Saving the decision…"
                    onConfirm={handleActionConfirm}
                    onClose={() => setAction(null)}
                >
                    <p className="text-[13px] text-slate-700">
                        Reject the recovery for <strong>{action.request.user?.displayName || 'this identity'}</strong>? The old wallet stays in place.
                    </p>
                    <div>
                        <label htmlFor="recovery-reject-reason" className={labelClass}>Reason</label>
                        <textarea
                            id="recovery-reject-reason"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                            maxLength={500}
                            disabled={busy}
                            className={`${fieldClass} resize-none`}
                            autoFocus
                        />
                    </div>
                </ConfirmDialog>
            )}

            {action?.type === 'execute' && (
                <ConfirmDialog
                    title="Execute recovery"
                    icon="key"
                    tone="warning"
                    confirmLabel="Execute recovery"
                    busy={busy}
                    onConfirm={handleActionConfirm}
                    onClose={() => setAction(null)}
                >
                    <p className="text-[13px] text-slate-700">
                        This retires <span className="font-mono text-[12px]">{shortWallet(action.request.oldWalletAddress || action.request.user?.walletAddress)}</span> on-chain
                        and registers the same DID to <span className="font-mono text-[12px]">{shortWallet(action.request.newWalletAddress)}</span>.
                        It sends two blockchain transactions and cannot be undone here.
                    </p>
                </ConfirmDialog>
            )}
        </section>
    );
}

function RequestDetail({ request, detail, busy, onApprove, onReject, onExecute }) {
    const canApprove = request.status === 'PENDING';
    const canExecute = request.status === 'APPROVED';
    const canReject = request.status === 'PENDING' || request.status === 'APPROVED';

    return (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 ui-fade-in">
            {!detail ? (
                <p className="text-xs text-slate-500">Loading details…</p>
            ) : (
                <>
                    <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                        <Field label="Reason">{detail.reason}</Field>
                        <Field label="Raised by">{detail.requestedBy?.displayName || 'Unknown'}</Field>
                        <Field label="Old wallet" mono>{detail.oldWalletAddress || detail.user?.walletAddress}</Field>
                        <Field label="New wallet" mono>{detail.newWalletAddress}</Field>
                        <Field label="Guardian approvals">
                            {detail.approvalCount} of {detail.threshold} needed ({detail.guardianCount} guardian{detail.guardianCount === 1 ? '' : 's'} assigned)
                        </Field>
                        <Field label="Approved by">
                            {detail.approvals?.length ? detail.approvals.map((a) => a.guardian?.displayName || 'Guardian').join(', ') : 'Nobody yet'}
                        </Field>
                        {detail.rejectionReason && <Field label="Rejection reason">{detail.rejectionReason}</Field>}
                        {detail.completedAt && <Field label="Completed">{formatWhen(detail.completedAt)}</Field>}
                        {isChainTxHash(detail.revokeTxHash) && <Field label="Old wallet retired"><TxLink hash={detail.revokeTxHash} /></Field>}
                        {isChainTxHash(detail.relinkTxHash) && <Field label="New wallet registered"><TxLink hash={detail.relinkTxHash} /></Field>}
                    </dl>

                    <div className="flex flex-wrap gap-2">
                        {canApprove && (
                            <button
                                type="button"
                                onClick={onApprove}
                                disabled={busy}
                                title="Only an assigned guardian who did not raise this request can approve"
                                className="inline-flex items-center gap-1 rounded border border-emerald-600 px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-600 hover:text-white transition-colors disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">how_to_vote</span>
                                Approve as guardian
                            </button>
                        )}
                        {canExecute && (
                            <button
                                type="button"
                                onClick={onExecute}
                                disabled={busy}
                                className="inline-flex items-center gap-1 rounded bg-[#1E5FA8] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#164a85] transition-colors disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">key</span>
                                Execute recovery
                            </button>
                        )}
                        {canReject && (
                            <button
                                type="button"
                                onClick={onReject}
                                disabled={busy}
                                className="inline-flex items-center gap-1 rounded border border-red-500 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">close</span>
                                Reject
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function Field({ label, mono = false, children }) {
    return (
        <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
            <dd className={`mt-0.5 break-all text-slate-800 ${mono ? 'font-mono text-[11px]' : ''}`}>{children}</dd>
        </div>
    );
}

function TxLink({ hash }) {
    return (
        <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="font-bold text-[#1E5FA8] underline">
            View on Sepolia Etherscan<span className="sr-only"> (opens in a new tab)</span>
        </a>
    );
}

function NewRequestDialog({ identities, onClose, onCreated }) {
    const toast = useToast();
    const [form, setForm] = useState({ userId: '', newWalletAddress: '', reason: '' });
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        const next = {};
        if (!form.userId) next.userId = 'Choose the person who lost their wallet.';
        if (!WALLET_PATTERN.test(form.newWalletAddress.trim())) next.newWalletAddress = 'Enter the replacement wallet: 0x followed by 40 hexadecimal characters.';
        if (form.reason.trim().length < 10) next.reason = 'Explain why in at least 10 characters.';
        setErrors(next);
        if (Object.keys(next).length) return;

        setBusy(true);
        try {
            await recoveryApi.request({
                userId: form.userId,
                newWalletAddress: form.newWalletAddress.trim(),
                reason: form.reason.trim(),
            });
            toast.success('Recovery request raised. Guardians can now vouch for it.');
            onCreated();
        } catch (err) {
            toast.error(err.uiMessage || 'The request could not be raised');
        } finally {
            setBusy(false);
        }
    };

    return (
        <ConfirmDialog
            title="New recovery request"
            icon="key"
            confirmLabel="Raise request"
            busy={busy}
            busyText="Saving the request…"
            onConfirm={submit}
            onClose={onClose}
        >
            <div>
                <label htmlFor="rec-user" className={labelClass}>Person who lost their wallet</label>
                <select
                    id="rec-user"
                    value={form.userId}
                    onChange={(e) => setForm({ ...form, userId: e.target.value })}
                    disabled={busy}
                    aria-invalid={errors.userId ? 'true' : undefined}
                    className={fieldClass}
                >
                    <option value="">Choose…</option>
                    {identities.filter((u) => !u.revokedAt).map((u) => (
                        <option key={u.id} value={u.id}>{`${u.displayName || 'Unnamed'}${u.externalId ? ` (${u.externalId})` : ''}`}</option>
                    ))}
                </select>
                {errors.userId && <p className="mt-1 text-[11px] font-bold text-red-600" role="alert">{errors.userId}</p>}
                <p className="mt-1 text-[11px] text-slate-500">They need guardians assigned first. See the Guardians tab.</p>
            </div>
            <div>
                <label htmlFor="rec-wallet" className={labelClass}>Replacement wallet address</label>
                <input
                    id="rec-wallet"
                    type="text"
                    value={form.newWalletAddress}
                    onChange={(e) => setForm({ ...form, newWalletAddress: e.target.value })}
                    disabled={busy}
                    placeholder="0x…"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={errors.newWalletAddress ? 'true' : undefined}
                    className={`${fieldClass} font-mono`}
                />
                {errors.newWalletAddress && <p className="mt-1 text-[11px] font-bold text-red-600" role="alert">{errors.newWalletAddress}</p>}
            </div>
            <div>
                <label htmlFor="rec-reason" className={labelClass}>Reason</label>
                <textarea
                    id="rec-reason"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    rows={3}
                    maxLength={500}
                    disabled={busy}
                    placeholder="Laptop lost during travel; verified in person with the SBU head"
                    aria-invalid={errors.reason ? 'true' : undefined}
                    className={`${fieldClass} resize-none`}
                />
                {errors.reason && <p className="mt-1 text-[11px] font-bold text-red-600" role="alert">{errors.reason}</p>}
            </div>
        </ConfirmDialog>
    );
}

/* ── Guardians ───────────────────────────────────────────── */

function GuardiansPanel({ identities }) {
    const toast = useToast();
    const [subjectId, setSubjectId] = useState('');
    const [guardians, setGuardians] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [candidate, setCandidate] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async (id) => {
        if (!id) {
            setGuardians([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            setGuardians(await recoveryApi.listGuardians(id));
        } catch (err) {
            setError(err.uiMessage || 'The guardians could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    const pickSubject = (id) => {
        setSubjectId(id);
        setCandidate('');
        load(id);
    };

    const active = useMemo(() => identities.filter((u) => !u.revokedAt), [identities]);
    const assignedIds = useMemo(() => new Set(guardians.map((g) => g.guardianId ?? g.guardian?.id)), [guardians]);
    const candidates = active.filter((u) => u.id !== subjectId && !assignedIds.has(u.id));

    const add = async () => {
        if (!candidate) return;
        setBusy(true);
        try {
            await recoveryApi.addGuardian(subjectId, candidate);
            toast.success('Guardian assigned');
            setCandidate('');
            load(subjectId);
        } catch (err) {
            toast.error(err.uiMessage || 'The guardian could not be assigned');
        } finally {
            setBusy(false);
        }
    };

    const remove = async (guardianId) => {
        setBusy(true);
        try {
            await recoveryApi.removeGuardian(subjectId, guardianId);
            toast.success('Guardian removed');
            load(subjectId);
        } catch (err) {
            toast.error(err.uiMessage || 'The guardian could not be removed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Guardians">
            <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-sm font-black uppercase tracking-wider text-[#0A1F3D]">Guardians</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                    A guardian is a colleague trusted to vouch that someone genuinely lost their wallet. Assign at least two.
                </p>
            </div>
            <div className="space-y-5 p-5">
                <div className="max-w-md">
                    <label htmlFor="guardian-subject" className={labelClass}>Protected identity</label>
                    <select id="guardian-subject" value={subjectId} onChange={(e) => pickSubject(e.target.value)} className={fieldClass}>
                        <option value="">Choose a person…</option>
                        {active.map((u) => (
                            <option key={u.id} value={u.id}>{`${u.displayName || 'Unnamed'}${u.externalId ? ` (${u.externalId})` : ''}`}</option>
                        ))}
                    </select>
                </div>

                {subjectId && (
                    <div className="space-y-4" aria-live="polite">
                        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</p>}
                        {loading && <p className="text-xs text-slate-500">Loading guardians…</p>}

                        {!loading && !error && guardians.length === 0 && (
                            <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                                No guardians yet. Recovery cannot be vouched for until some are assigned.
                            </p>
                        )}

                        {!loading && guardians.length > 0 && (
                            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 ui-stagger">
                                {guardians.map((g, index) => {
                                    const person = g.guardian || {};
                                    const guardianId = g.guardianId ?? person.id;
                                    return (
                                        <li key={g.id ?? guardianId} style={{ '--i': index }} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-[#0A1F3D]">{person.displayName || 'Unnamed identity'}</p>
                                                <p className="font-mono text-[11px] text-slate-500">{shortWallet(person.walletAddress)}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <RoleBadge role={person.role} />
                                                <button
                                                    type="button"
                                                    onClick={() => remove(guardianId)}
                                                    disabled={busy}
                                                    aria-label={`Remove ${person.displayName || 'guardian'}`}
                                                    className="inline-flex items-center gap-1 rounded border border-red-500 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">person_remove</span>
                                                    Remove
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        <div className="flex max-w-xl flex-wrap items-end gap-3">
                            <div className="min-w-[220px] flex-1">
                                <label htmlFor="guardian-candidate" className={labelClass}>Add a guardian</label>
                                <select id="guardian-candidate" value={candidate} onChange={(e) => setCandidate(e.target.value)} disabled={busy} className={fieldClass}>
                                    <option value="">Choose a colleague…</option>
                                    {candidates.map((u) => (
                                        <option key={u.id} value={u.id}>{`${u.displayName || 'Unnamed'} (${u.role})`}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={add}
                                disabled={!candidate || busy}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E5FA8] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#164a85] disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">person_add</span>
                                Assign
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
