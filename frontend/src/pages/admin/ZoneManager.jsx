import { useState, useEffect, useCallback } from 'react';
import { adminApi, pacsApi } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ClearanceBadge } from '../../components/ui/Badge';

const SBU_OPTIONS = [
    ['SBU_RADAR', 'Radar'],
    ['SBU_EW', 'Electronic Warfare'],
    ['SBU_MILCOMM', 'Military Comm'],
    ['SBU_CYBER', 'Cyber Security'],
];
const SBU_LABELS = Object.fromEntries(SBU_OPTIONS);
const CLEARANCE_OPTIONS = [
    [1, 'Level 1: Restricted'],
    [2, 'Level 2: Confidential'],
    [3, 'Level 3: Secret'],
    [4, 'Level 4: Top Secret'],
];

const EMPTY_FORM = { zoneId: '', name: '', sbu: '', requiredClearance: 1 };
const ZONE_ID_PATTERN = /^[A-Za-z0-9_-]{1,31}$/;

const fieldClass =
    'w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:border-[#1E5FA8] focus:ring-1 focus:ring-[#1E5FA8] outline-none disabled:opacity-60 disabled:bg-slate-100';
const labelClass = 'block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1';

export default function ZoneManager() {
    const toast = useToast();
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [editing, setEditing] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [lockTarget, setLockTarget] = useState(null); // { zone, locked }
    const [lockBusy, setLockBusy] = useState(false);

    const fetchZones = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setZones(await adminApi.listZones());
        } catch (err) {
            setError(err.uiMessage || 'Facility zones could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchZones();
    }, [fetchZones]);

    const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

    const startEdit = (zone) => {
        setEditing(true);
        setFieldErrors({});
        setForm({
            zoneId: zone.zoneId,
            name: zone.name,
            sbu: zone.sbu || '',
            requiredClearance: zone.requiredClearance,
        });
        document.getElementById('zone-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const resetForm = () => {
        setEditing(false);
        setFieldErrors({});
        setForm(EMPTY_FORM);
    };

    const validate = () => {
        const errors = {};
        if (!ZONE_ID_PATTERN.test(form.zoneId.trim())) {
            errors.zoneId = 'Up to 31 letters, digits, hyphens or underscores.';
        }
        if (!form.name.trim()) errors.name = 'A zone needs a name.';
        return errors;
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const errors = validate();
        setFieldErrors(errors);
        if (Object.keys(errors).length) return;

        setSaving(true);
        try {
            const zone = await adminApi.upsertZone({
                zoneId: form.zoneId.trim(),
                name: form.name.trim(),
                sbu: form.sbu || null,
                requiredClearance: Number(form.requiredClearance),
            });
            if (zone.chain?.confirmed === false) {
                toast.warning(`${zone.name} saved in the database only. The AccessControl contract is not configured on this server.`);
            } else {
                toast.success(`${zone.name} ${zone.created ? 'created' : 'updated'} and configured on-chain`);
            }
            resetForm();
            fetchZones();
        } catch (err) {
            toast.error(err.uiMessage || 'The zone could not be saved');
        } finally {
            setSaving(false);
        }
    };

    const handleLockConfirm = async () => {
        const { zone, locked } = lockTarget;
        setLockBusy(true);
        try {
            await pacsApi.setLockdown(zone.zoneId, locked);
            toast[locked ? 'warning' : 'success'](locked ? `${zone.name} is locked down` : `${zone.name} lockdown lifted`);
            setLockTarget(null);
            fetchZones();
        } catch (err) {
            toast.error(err.uiMessage || 'The lockdown could not be changed');
        } finally {
            setLockBusy(false);
        }
    };

    const lockedCount = zones.filter((z) => z.isEmergencyLocked).length;

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
                    <h1 className="text-2xl font-black text-[#0A1F3D] tracking-wide">Facility Zones</h1>
                    <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                        Set the clearance each door requires and freeze a zone in one click. Both are enforced by the AccessControl
                        contract, so a badge tap is decided on-chain, not by this app.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {!loading && !error && (
                        <span
                            className={`rounded-full px-3 py-1 text-[11px] font-bold border ${
                                lockedCount
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                        >
                            {lockedCount ? `${lockedCount} zone${lockedCount === 1 ? '' : 's'} locked down` : 'All zones operating'}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={fetchZones}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#1E5FA8] px-4 py-2 text-xs font-bold text-[#1E5FA8] hover:bg-[#1E5FA8] hover:text-white transition-colors disabled:opacity-50"
                    >
                        <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                        Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section aria-label="Facility zones">
                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                            <p className="font-bold">Unable to load zones</p>
                            <p className="mt-0.5">{error}</p>
                            <button type="button" onClick={fetchZones} className="mt-2 font-bold underline">Retry</button>
                        </div>
                    )}

                    {!error && loading && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-40 rounded-xl border border-slate-200 bg-white animate-pulse" />
                            ))}
                        </div>
                    )}

                    {!error && !loading && zones.length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
                            <span className="material-symbols-outlined block text-[38px] text-slate-300 mb-2" aria-hidden="true">meeting_room</span>
                            <p className="text-sm font-bold text-slate-600">No facility zones yet</p>
                            <p className="text-xs text-slate-400 mt-1">Create the first zone with the form.</p>
                        </div>
                    )}

                    {!error && !loading && zones.length > 0 && (
                        <ul className="grid gap-4 sm:grid-cols-2 ui-stagger">
                            {zones.map((zone, index) => (
                                <li
                                    key={zone.id}
                                    style={{ '--i': index }}
                                    className={`relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                                        zone.isEmergencyLocked ? 'border-red-300' : 'border-slate-200'
                                    }`}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={`absolute inset-y-0 left-0 w-1 ${zone.isEmergencyLocked ? 'bg-red-500' : 'bg-emerald-500'}`}
                                    />
                                    <div className="flex items-start justify-between gap-3 pl-2">
                                        <div className="min-w-0">
                                            <h3 className="truncate text-sm font-black text-[#0A1F3D]">{zone.name}</h3>
                                            <p className="mt-0.5 font-mono text-[11px] text-slate-500">{zone.zoneId}</p>
                                        </div>
                                        <span
                                            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${
                                                zone.isEmergencyLocked
                                                    ? 'bg-red-50 text-red-700 border-red-200'
                                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                                                {zone.isEmergencyLocked ? 'lock' : 'lock_open'}
                                            </span>
                                            {zone.isEmergencyLocked ? 'LOCKED DOWN' : 'OPEN'}
                                        </span>
                                    </div>

                                    <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-2 text-xs">
                                        <div>
                                            <dt className="sr-only">Required clearance</dt>
                                            <dd><ClearanceBadge level={zone.requiredClearance} /></dd>
                                        </div>
                                        <div>
                                            <dt className="sr-only">Business unit</dt>
                                            <dd className="rounded bg-[#1E5FA8]/10 px-2 py-0.5 text-[11px] font-bold text-[#1E5FA8]">
                                                {zone.sbu ? SBU_LABELS[zone.sbu] ?? zone.sbu : 'Any SBU'}
                                            </dd>
                                        </div>
                                    </dl>

                                    <div className="mt-4 flex gap-2 pl-2">
                                        <button
                                            type="button"
                                            onClick={() => startEdit(zone)}
                                            className="inline-flex items-center gap-1 rounded border border-[#1E5FA8] px-2.5 py-1 text-[11px] font-bold text-[#1E5FA8] hover:bg-[#1E5FA8] hover:text-white transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">edit</span>
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setLockTarget({ zone, locked: !zone.isEmergencyLocked })}
                                            className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                                zone.isEmergencyLocked
                                                    ? 'border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white'
                                                    : 'border-red-500 text-red-600 hover:bg-red-600 hover:text-white'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                                                {zone.isEmergencyLocked ? 'lock_open' : 'emergency'}
                                            </span>
                                            {zone.isEmergencyLocked ? 'Lift lockdown' : 'Emergency lockdown'}
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <aside id="zone-form-card" className="h-fit rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-wider text-[#0A1F3D]">
                                {editing ? 'Edit zone' : 'Add a zone'}
                            </h2>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                                {editing ? 'Saving replaces the zone on-chain.' : 'Created on-chain through AccessControl.'}
                            </p>
                        </div>
                        {editing && (
                            <button type="button" onClick={resetForm} className="text-[11px] font-bold text-slate-500 underline hover:text-[#0A1F3D]">
                                New zone
                            </button>
                        )}
                    </div>
                    <form onSubmit={handleSave} noValidate className="space-y-4 p-5">
                        <div>
                            <label htmlFor="zone-id" className={labelClass}>Zone ID</label>
                            <input
                                id="zone-id"
                                type="text"
                                value={form.zoneId}
                                onChange={(e) => update({ zoneId: e.target.value })}
                                disabled={editing || saving}
                                placeholder="ZONE_ANECHOIC_CHAMBER"
                                autoComplete="off"
                                spellCheck={false}
                                aria-invalid={fieldErrors.zoneId ? 'true' : undefined}
                                aria-describedby={fieldErrors.zoneId ? 'zone-id-error' : undefined}
                                className={`${fieldClass} font-mono`}
                            />
                            {fieldErrors.zoneId && <p id="zone-id-error" className="mt-1 text-[11px] font-bold text-red-600" role="alert">{fieldErrors.zoneId}</p>}
                        </div>
                        <div>
                            <label htmlFor="zone-name" className={labelClass}>Name</label>
                            <input
                                id="zone-name"
                                type="text"
                                value={form.name}
                                onChange={(e) => update({ name: e.target.value })}
                                disabled={saving}
                                placeholder="RF Anechoic Test Chamber"
                                maxLength={120}
                                aria-invalid={fieldErrors.name ? 'true' : undefined}
                                aria-describedby={fieldErrors.name ? 'zone-name-error' : undefined}
                                className={fieldClass}
                            />
                            {fieldErrors.name && <p id="zone-name-error" className="mt-1 text-[11px] font-bold text-red-600" role="alert">{fieldErrors.name}</p>}
                        </div>
                        <div>
                            <label htmlFor="zone-clearance" className={labelClass}>Required clearance</label>
                            <select
                                id="zone-clearance"
                                value={form.requiredClearance}
                                onChange={(e) => update({ requiredClearance: e.target.value })}
                                disabled={saving}
                                className={fieldClass}
                            >
                                {CLEARANCE_OPTIONS.map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="zone-sbu" className={labelClass}>Business unit</label>
                            <select
                                id="zone-sbu"
                                value={form.sbu}
                                onChange={(e) => update({ sbu: e.target.value })}
                                disabled={saving}
                                className={fieldClass}
                            >
                                <option value="">Any SBU</option>
                                {SBU_OPTIONS.map(([value, label]) => (
                                    <option key={value} value={value}>{label} only</option>
                                ))}
                            </select>
                            <p className="mt-1 text-[11px] text-slate-500">
                                A single-SBU zone also admits holders of an active cross-SBU pass.
                            </p>
                        </div>
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E5FA8] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#164a85] disabled:opacity-60"
                        >
                            {saving && <span className="material-symbols-outlined animate-spin text-[18px]" aria-hidden="true">progress_activity</span>}
                            {saving ? 'Writing to the blockchain…' : editing ? 'Save changes' : 'Create zone'}
                        </button>
                    </form>
                </aside>
            </div>

            {lockTarget && (
                <ConfirmDialog
                    title={lockTarget.locked ? 'Emergency lockdown' : 'Lift lockdown'}
                    icon={lockTarget.locked ? 'emergency' : 'lock_open'}
                    tone={lockTarget.locked ? 'danger' : 'primary'}
                    confirmLabel={lockTarget.locked ? 'Lock down zone' : 'Lift lockdown'}
                    busy={lockBusy}
                    onConfirm={handleLockConfirm}
                    onClose={() => setLockTarget(null)}
                >
                    <div className="rounded-lg bg-[#0A1F3D] p-2.5">
                        <div className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-wider">Zone</div>
                        <div className="text-sm font-bold text-white">{lockTarget.zone.name}</div>
                        <div className="text-[11px] text-slate-300 font-mono">{lockTarget.zone.zoneId}</div>
                    </div>
                    <p className="text-[13px] text-slate-700">
                        {lockTarget.locked
                            ? 'Every badge tap at this zone is denied until the lockdown is lifted, whatever the holder’s clearance. The change is written on-chain.'
                            : 'Badge taps at this zone are decided by clearance and SBU again.'}
                    </p>
                </ConfirmDialog>
            )}
        </div>
    );
}
