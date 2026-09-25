import { useState, useEffect, useCallback, useMemo } from 'react';
import { passApi, userApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';

const SBU_OPTIONS = [
    ['SBU_RADAR', 'Radar'],
    ['SBU_EW', 'Electronic Warfare'],
    ['SBU_MILCOMM', 'Military Comm'],
    ['SBU_CYBER', 'Cyber Security'],
];
const SBU_LABELS = Object.fromEntries(SBU_OPTIONS);

// [hours, label]. A visiting contractor is typically hours, a project loan days.
const DURATIONS = [
    [4, '4 hours'],
    [8, 'Working day (8 h)'],
    [24, '24 hours'],
    [72, '3 days'],
    [168, '1 week'],
];

const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const fieldClass =
    'w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:border-[#1E5FA8] focus:ring-1 focus:ring-[#1E5FA8] outline-none disabled:opacity-60 disabled:bg-slate-100';
const labelClass = 'block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1';

const shortWallet = (address = '') => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

function timeLeft(validUntil) {
    const ms = new Date(validUntil).getTime() - Date.now();
    if (Number.isNaN(ms)) return '';
    if (ms <= 0) return 'expired';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} min left`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} h left`;
    return `${Math.round(hours / 24)} days left`;
}

const formatUntil = (value) =>
    new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AccessPasses() {
    const toast = useToast();
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';

    const [people, setPeople] = useState([]);
    const [form, setForm] = useState({
        wallet: '',
        targetSbu: isAdmin ? 'SBU_RADAR' : user?.sbu || '',
        durationHours: 24,
        reason: '',
    });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [issued, setIssued] = useState([]);

    const [lookupId, setLookupId] = useState('');
    const [lookup, setLookup] = useState({ status: 'idle', passes: [], error: null });

    useEffect(() => {
        let cancelled = false;
        userApi
            .listTransferRecipients({ limit: 100 })
            .then((data) => {
                if (!cancelled) setPeople((data.users || []).filter((p) => p.walletAddress));
            })
            .catch(() => {
                // Suggestions are a convenience; a pasted wallet address still works.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

    const matchedPerson = useMemo(
        () => people.find((p) => p.walletAddress?.toLowerCase() === form.wallet.trim().toLowerCase()),
        [people, form.wallet]
    );

    const handleIssue = async (e) => {
        e.preventDefault();
        const next = {};
        if (!WALLET_PATTERN.test(form.wallet.trim())) next.wallet = 'Enter a wallet address: 0x followed by 40 hexadecimal characters.';
        if (!form.targetSbu) next.targetSbu = 'Choose the business unit the pass opens.';
        setErrors(next);
        if (Object.keys(next).length) return;

        setSaving(true);
        try {
            const pass = await passApi.grant({
                walletAddress: form.wallet.trim(),
                targetSbu: form.targetSbu,
                durationHours: Number(form.durationHours),
                ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
            });
            setIssued((prev) => [pass, ...prev]);
            toast.success(`Pass issued to ${pass.user?.displayName || shortWallet(form.wallet)} for ${SBU_LABELS[pass.targetSbu] ?? pass.targetSbu}`);
            update({ wallet: '', reason: '' });
        } catch (err) {
            toast.error(err.uiMessage || 'The pass could not be issued');
        } finally {
            setSaving(false);
        }
    };

    const runLookup = useCallback(async (id) => {
        if (!id) {
            setLookup({ status: 'idle', passes: [], error: null });
            return;
        }
        setLookup({ status: 'loading', passes: [], error: null });
        try {
            const passes = await passApi.active(id);
            setLookup({ status: 'done', passes, error: null });
        } catch (err) {
            setLookup({ status: 'error', passes: [], error: err.uiMessage || 'The passes could not be loaded.' });
        }
    }, []);

    const handleLookupChange = (id) => {
        setLookupId(id);
        runLookup(id);
    };

    return (
        <div className="min-h-full p-6 sm:p-8 space-y-6 bg-slate-100/60">
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="h-px w-12 bg-gradient-to-r from-[#D4AF37]/60 to-transparent" />
                    <span className="text-[10px] font-black tracking-[0.22em] text-[#B8962E] uppercase">
                        {isAdmin ? 'RESTRICTED · ADMIN CLEARANCE' : 'MANAGER CLEARANCE'}
                    </span>
                </div>
                <h1 className="text-2xl font-black text-[#0A1F3D] tracking-wide">Cross-SBU Access Passes</h1>
                <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                    Give someone time-boxed visibility into your business unit, for example a visiting scientist or a colleague on a
                    joint project. A pass grants visibility, not authority: the holder still cannot approve transfers or mint here.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                <section className="h-fit rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 px-5 py-4">
                        <h2 className="text-sm font-black uppercase tracking-wider text-[#0A1F3D]">Issue a pass</h2>
                        <p className="mt-0.5 text-[11px] text-slate-500">The pass starts now and expires on its own.</p>
                    </div>
                    <form onSubmit={handleIssue} noValidate className="space-y-4 p-5">
                        <div>
                            <label htmlFor="pass-wallet" className={labelClass}>Person&apos;s wallet address</label>
                            <input
                                id="pass-wallet"
                                type="text"
                                list="pass-people"
                                value={form.wallet}
                                onChange={(e) => update({ wallet: e.target.value })}
                                disabled={saving}
                                placeholder="0x… or pick a name"
                                autoComplete="off"
                                spellCheck={false}
                                aria-invalid={errors.wallet ? 'true' : undefined}
                                aria-describedby={errors.wallet ? 'pass-wallet-error' : 'pass-wallet-help'}
                                className={`${fieldClass} font-mono`}
                            />
                            <datalist id="pass-people">
                                {people.map((p) => (
                                    <option key={p.id} value={p.walletAddress}>{`${p.displayName || 'Unnamed'} (${SBU_LABELS[p.sbu] ?? p.sbu})`}</option>
                                ))}
                            </datalist>
                            {errors.wallet ? (
                                <p id="pass-wallet-error" className="mt-1 text-[11px] font-bold text-red-600" role="alert">{errors.wallet}</p>
                            ) : (
                                <p id="pass-wallet-help" className="mt-1 text-[11px] text-slate-500">
                                    {matchedPerson
                                        ? `${matchedPerson.displayName || 'Unnamed'}, ${SBU_LABELS[matchedPerson.sbu] ?? matchedPerson.sbu}`
                                        : 'They must already hold a registered identity.'}
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="pass-sbu" className={labelClass}>Opens business unit</label>
                            <select
                                id="pass-sbu"
                                value={form.targetSbu}
                                onChange={(e) => update({ targetSbu: e.target.value })}
                                disabled={saving || !isAdmin}
                                aria-invalid={errors.targetSbu ? 'true' : undefined}
                                className={fieldClass}
                            >
                                {!form.targetSbu && <option value="">Choose…</option>}
                                {SBU_OPTIONS.map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                            {!isAdmin && (
                                <p className="mt-1 text-[11px] text-slate-500">Managers can only open their own unit.</p>
                            )}
                            {errors.targetSbu && <p className="mt-1 text-[11px] font-bold text-red-600" role="alert">{errors.targetSbu}</p>}
                        </div>

                        <fieldset>
                            <legend className={labelClass}>Valid for</legend>
                            <div className="flex flex-wrap gap-2">
                                {DURATIONS.map(([hours, label]) => (
                                    <label
                                        key={hours}
                                        className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                                            Number(form.durationHours) === hours
                                                ? 'border-[#1E5FA8] bg-[#1E5FA8] text-white'
                                                : 'border-slate-300 text-slate-600 hover:border-[#1E5FA8] hover:text-[#1E5FA8]'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="pass-duration"
                                            value={hours}
                                            checked={Number(form.durationHours) === hours}
                                            onChange={() => update({ durationHours: hours })}
                                            disabled={saving}
                                            className="sr-only"
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <div>
                            <label htmlFor="pass-reason" className={labelClass}>Reason (optional)</label>
                            <input
                                id="pass-reason"
                                type="text"
                                value={form.reason}
                                onChange={(e) => update({ reason: e.target.value })}
                                disabled={saving}
                                maxLength={200}
                                placeholder="Visiting DRDO scientist, joint radar trial"
                                className={fieldClass}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E5FA8] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#164a85] disabled:opacity-60"
                        >
                            {saving && <span className="material-symbols-outlined animate-spin text-[18px]" aria-hidden="true">progress_activity</span>}
                            {saving ? 'Issuing…' : 'Issue pass'}
                        </button>
                    </form>
                </section>

                <div className="space-y-6">
                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="issued-heading">
                        <div className="border-b border-slate-200 px-5 py-4">
                            <h2 id="issued-heading" className="text-sm font-black uppercase tracking-wider text-[#0A1F3D]">Issued in this session</h2>
                        </div>
                        {issued.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <span className="material-symbols-outlined block text-[34px] text-slate-300 mb-1.5" aria-hidden="true">badge</span>
                                <p className="text-sm font-bold text-slate-600">No passes issued yet</p>
                                <p className="mt-1 text-xs text-slate-400">Passes you issue appear here. Use the lookup below to check anyone&apos;s active passes.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-slate-100 ui-stagger">
                                {issued.map((pass, index) => (
                                    <PassRow key={pass.id} pass={pass} index={index} showHolder />
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="lookup-heading">
                        <div className="border-b border-slate-200 px-5 py-4">
                            <h2 id="lookup-heading" className="text-sm font-black uppercase tracking-wider text-[#0A1F3D]">Look up active passes</h2>
                            <p className="mt-0.5 text-[11px] text-slate-500">Pick anyone you can see to list the passes that are still valid.</p>
                        </div>
                        <div className="space-y-4 p-5">
                            <div>
                                <label htmlFor="lookup-person" className={labelClass}>Person</label>
                                <select
                                    id="lookup-person"
                                    value={lookupId}
                                    onChange={(e) => handleLookupChange(e.target.value)}
                                    className={fieldClass}
                                >
                                    <option value="">Choose a person…</option>
                                    {people.map((p) => (
                                        <option key={p.id} value={p.id}>{`${p.displayName || 'Unnamed'} (${SBU_LABELS[p.sbu] ?? p.sbu})`}</option>
                                    ))}
                                </select>
                            </div>
                            <div aria-live="polite">
                                {lookup.status === 'loading' && <p className="text-xs text-slate-500">Loading passes…</p>}
                                {lookup.status === 'error' && (
                                    <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{lookup.error}</p>
                                )}
                                {lookup.status === 'done' && lookup.passes.length === 0 && (
                                    <p className="text-xs text-slate-500">No active cross-SBU passes for this person.</p>
                                )}
                                {lookup.status === 'done' && lookup.passes.length > 0 && (
                                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                                        {lookup.passes.map((pass, index) => (
                                            <PassRow key={pass.id} pass={pass} index={index} />
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

function PassRow({ pass, index, showHolder = false }) {
    const remaining = timeLeft(pass.validUntil);
    return (
        <li style={{ '--i': index }} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
                {showHolder && (
                    <p className="text-sm font-bold text-[#0A1F3D]">
                        {pass.user?.displayName || 'Unnamed identity'}
                        <span className="ml-2 font-mono text-[11px] font-normal text-slate-500">{shortWallet(pass.user?.walletAddress)}</span>
                    </p>
                )}
                <p className="text-xs text-slate-600">
                    Opens <strong>{SBU_LABELS[pass.targetSbu] ?? pass.targetSbu}</strong>
                    {pass.reason ? ` · ${pass.reason}` : ''}
                </p>
                {pass.issuedBy?.displayName && (
                    <p className="text-[11px] text-slate-400">Issued by {pass.issuedBy.displayName}</p>
                )}
            </div>
            <div className="text-right">
                <p className="text-xs font-bold text-emerald-700">{remaining}</p>
                <p className="text-[11px] text-slate-400">until {formatUntil(pass.validUntil)}</p>
            </div>
        </li>
    );
}
