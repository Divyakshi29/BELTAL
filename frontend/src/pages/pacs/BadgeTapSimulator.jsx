import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTransaction } from '../../context/TransactionContext';
import { adminApi, userApi, pacsApi } from '../../services/api';
import useModalA11y from '../../hooks/useModalA11y';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

const POLL_INTERVAL_MS = 10_000;
const EVENT_LIMIT = 20;
const EMPLOYEE_LIMIT = 100;

const fieldClass =
    'w-full rounded border border-[#b9dcef] bg-white px-3 py-2 text-sm text-[#0d2b4e] outline-none focus:border-[#1E5FA8] focus-visible:ring-2 focus-visible:ring-[#1E5FA8]/30 disabled:opacity-60';
const labelClass = 'block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2';

const sbuLabel = (sbu) => (sbu ? sbu.replace('SBU_', '') : 'All SBUs');
const explorerTxUrl = (txHash) => `https://sepolia.etherscan.io/tx/${txHash}`;
const shortHash = (hash) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

/**
 * Maps the decision reason returned by the backend to a readable explanation.
 * The reason is either the on-chain canAccessZone() string, or one of the
 * backend's own codes (ZONE_EMERGENCY_LOCKDOWN, ACCESS_DENIED, contract not
 * configured). Anything unrecognised falls through with the raw reason shown.
 */
function describeReason(reason, zone, employee) {
    const raw = reason || '';
    const name = employee?.displayName || 'The employee';

    if (!raw) {
        return {
            key: 'GRANTED',
            title: 'All checks passed',
            detail: 'Identity is active, clearance meets the zone requirement, and the SBU check passed.',
        };
    }
    if (/lockdown/i.test(raw)) {
        return {
            key: 'LOCKDOWN',
            title: 'Emergency lockdown',
            detail: 'The zone is under emergency lockdown. All access is denied regardless of clearance or SBU.',
        };
    }
    if (/insufficient clearance/i.test(raw)) {
        return {
            key: 'CLEARANCE',
            title: 'Insufficient clearance',
            detail:
                zone && employee
                    ? `This zone requires clearance level ${zone.requiredClearance}; ${name} holds level ${employee.clearanceLevel}.`
                    : 'The employee\'s clearance level is below the zone requirement.',
        };
    }
    if (/sbu mismatch/i.test(raw)) {
        return {
            key: 'SBU',
            title: 'Wrong SBU',
            detail:
                zone && employee
                    ? `This zone is restricted to ${sbuLabel(zone.sbu)}; ${name} belongs to ${sbuLabel(employee.sbu)}, and no temporary cross-SBU pass is active.`
                    : 'The employee\'s SBU does not match the zone and no temporary cross-SBU pass is active.',
        };
    }
    if (/inactive|not registered|revoked/i.test(raw)) {
        return {
            key: 'IDENTITY',
            title: 'Identity revoked or not registered',
            detail: `${name} has no active on-chain identity, so the badge is not honoured at any zone.`,
        };
    }
    if (/zone does not exist/i.test(raw)) {
        return {
            key: 'ZONE',
            title: 'Zone not provisioned on-chain',
            detail: 'The zone exists in the database but has not been configured in the AccessControl contract.',
        };
    }
    if (/not configured/i.test(raw)) {
        return {
            key: 'CONTRACT',
            title: 'On-chain check unavailable',
            detail: 'The backend has no AccessControl contract configured, so the decision could not be made on-chain. Access is denied by default.',
        };
    }
    return {
        key: 'OTHER',
        title: 'Access denied',
        detail: 'The access check returned a denial. See the reason code below.',
    };
}

const formatTime = (value) => (value ? new Date(value).toLocaleString() : '—');

export default function BadgeTapSimulator() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'ADMIN';
    const { showSuccess, showError } = useTransaction();

    const [zones, setZones] = useState([]);
    const [events, setEvents] = useState([]);
    const [eventsTotal, setEventsTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [zonesError, setZonesError] = useState(null);
    const [eventsError, setEventsError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const [employees, setEmployees] = useState([]);
    const [employeesTotal, setEmployeesTotal] = useState(0);
    const [employeesLoading, setEmployeesLoading] = useState(true);
    const [employeesError, setEmployeesError] = useState(null);

    const [zoneId, setZoneId] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [readerId, setReaderId] = useState('');
    const [tapping, setTapping] = useState(false);
    const [tapError, setTapError] = useState(null);
    const [result, setResult] = useState(null);

    const [lockdownTarget, setLockdownTarget] = useState(null);
    const [lockdownBusy, setLockdownBusy] = useState(false);

    const mounted = useRef(true);
    const inFlight = useRef(false);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const loadLive = useCallback(async ({ manual = false } = {}) => {
        if (inFlight.current) return;
        inFlight.current = true;
        if (manual) setRefreshing(true);
        const [zonesResult, eventsResult] = await Promise.allSettled([
            pacsApi.listZones(),
            pacsApi.listEvents({ page: 1, limit: EVENT_LIMIT }),
        ]);
        inFlight.current = false;
        if (!mounted.current) return;

        if (zonesResult.status === 'fulfilled') {
            setZones(zonesResult.value);
            setZonesError(null);
        } else {
            console.error('Failed to fetch PACS zones', zonesResult.reason);
            setZonesError(zonesResult.reason?.uiMessage || 'Facility zones could not be loaded.');
        }
        if (eventsResult.status === 'fulfilled') {
            setEvents(eventsResult.value.events);
            setEventsTotal(eventsResult.value.pagination?.total ?? eventsResult.value.events.length);
            setEventsError(null);
        } else {
            console.error('Failed to fetch PACS events', eventsResult.reason);
            setEventsError(eventsResult.reason?.uiMessage || 'Recent badge events could not be loaded.');
        }
        if (zonesResult.status === 'fulfilled' || eventsResult.status === 'fulfilled') {
            setLastUpdated(new Date());
        }
        setLoading(false);
        setRefreshing(false);
    }, []);

    // Initial load, then a gentle poll that pauses while the tab is hidden and
    // catches up as soon as it becomes visible again.
    useEffect(() => {
        loadLive();
        const tick = () => {
            if (!document.hidden) loadLive();
        };
        const intervalId = setInterval(tick, POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', tick);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [loadLive]);

    // Employee directory: the admin identity listing for admins, the shared
    // transfer-recipients directory (narrowed to the manager's SBU) for managers.
    const loadEmployees = useCallback(async () => {
        setEmployeesLoading(true);
        setEmployeesError(null);
        try {
            let list;
            let total;
            if (isAdmin) {
                const data = await adminApi.listIdentities({ limit: EMPLOYEE_LIMIT });
                list = data?.users || [];
                total = data?.total ?? list.length;
            } else {
                const data = await userApi.listTransferRecipients({ limit: EMPLOYEE_LIMIT });
                list = (data?.users || []).filter((member) => member.sbu === user?.sbu);
                total = list.length;
            }
            if (!mounted.current) return;
            const people = list
                .filter((person) => person.role !== 'SYSTEM_CONNECTOR')
                .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
            setEmployees(people);
            setEmployeesTotal(total);
        } catch (err) {
            console.error('Failed to fetch employees', err);
            if (!mounted.current) return;
            setEmployees([]);
            setEmployeesError(err.uiMessage || 'The employee directory could not be loaded.');
        } finally {
            if (mounted.current) setEmployeesLoading(false);
        }
    }, [isAdmin, user?.sbu]);

    useEffect(() => {
        loadEmployees();
    }, [loadEmployees]);

    const selectedZone = useMemo(() => zones.find((z) => z.zoneId === zoneId) || null, [zones, zoneId]);
    const selectedEmployee = useMemo(() => employees.find((e) => e.id === employeeId) || null, [employees, employeeId]);

    // The zone list can change under the selection (e.g. a manager's scope).
    const zoneStillListed = !zoneId || Boolean(selectedZone);

    const handleTap = async (e) => {
        e.preventDefault();
        if (!zoneId || !employeeId || tapping) return;
        setTapping(true);
        setTapError(null);
        setResult(null);
        try {
            const payload = { zoneId, employeeId };
            if (readerId.trim()) payload.readerId = readerId.trim();
            const data = await pacsApi.simulateTap(payload);
            if (!mounted.current) return;
            setResult(data);
            loadLive();
        } catch (err) {
            console.error('Simulated tap failed', err);
            if (mounted.current) setTapError(err.uiMessage || 'The badge tap could not be processed.');
        } finally {
            if (mounted.current) setTapping(false);
        }
    };

    const confirmLockdown = async () => {
        if (!lockdownTarget) return;
        const { zone, locked } = lockdownTarget;
        setLockdownBusy(true);
        try {
            const data = await pacsApi.setLockdown(zone.zoneId, locked);
            const onChain = data?.chain?.confirmed;
            showSuccess(
                `${zone.name}: lockdown ${locked ? 'enabled' : 'lifted'}${onChain ? ' and recorded on-chain.' : ' (recorded off-chain; on-chain confirmation pending).'}`
            );
            setLockdownTarget(null);
            loadLive();
        } catch (err) {
            console.error('Lockdown toggle failed', err);
            showError(`Failed to update lockdown: ${err.uiMessage || err.message}`);
        } finally {
            if (mounted.current) setLockdownBusy(false);
        }
    };

    const resultEvent = result ? events.find((event) => event.id === result.badgeEventId) : null;

    return (
        <div className="role-console min-h-full p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="h-px w-12 bg-gradient-to-r from-[#D4AF37]/40 to-transparent" />
                        <span className="text-[9px] font-black tracking-[0.22em] text-[#D4AF37]/60 uppercase">
                            ◈ PHYSICAL ACCESS — {isAdmin ? 'ADMIN' : 'MANAGER'} CLEARANCE
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-wide">PACS Badge-Tap Simulator</h1>
                </div>
            </div>

            <div
                role="note"
                className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
            >
                <span className="material-symbols-outlined text-[20px] text-amber-600" aria-hidden="true">science</span>
                <p>
                    <span className="font-bold">Demo simulator.</span> No physical reader is involved. Each simulated tap is
                    stored as a real PACS event and, when the AccessControl contract is configured, is decided by the
                    on-chain <span className="font-mono">canAccessZone()</span> check.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                {/* ── Tap form + result ── */}
                <div className="lg:col-span-2 space-y-5">
                    <Card goldAccent={false}>
                        <CardHeader>
                            <CardTitle>Tap Badge at Reader</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleTap} className="space-y-5">
                                {employeesError && (
                                    <div className="rounded-lg border border-red-500/40 p-3 text-xs text-red-500" role="alert">
                                        <p>{employeesError}</p>
                                        <button type="button" onClick={loadEmployees} className="mt-2 font-bold underline">Retry</button>
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="pacs-zone" className={labelClass}>Facility Zone *</label>
                                    <select
                                        id="pacs-zone"
                                        required
                                        value={zoneId}
                                        onChange={(e) => setZoneId(e.target.value)}
                                        disabled={loading || zones.length === 0}
                                        className={fieldClass}
                                    >
                                        <option value="">{loading ? 'Loading zones…' : '-- Select a zone --'}</option>
                                        {zones.map((zone) => (
                                            <option key={zone.zoneId} value={zone.zoneId}>
                                                {zone.name} (Level {zone.requiredClearance}, {sbuLabel(zone.sbu)})
                                                {zone.isEmergencyLocked ? ' — LOCKDOWN' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label htmlFor="pacs-employee" className={labelClass}>Employee *</label>
                                    <select
                                        id="pacs-employee"
                                        required
                                        value={employeeId}
                                        onChange={(e) => setEmployeeId(e.target.value)}
                                        disabled={employeesLoading || employees.length === 0}
                                        className={fieldClass}
                                    >
                                        <option value="">{employeesLoading ? 'Loading employees…' : '-- Select an employee --'}</option>
                                        {employees.map((person) => (
                                            <option key={person.id} value={person.id}>
                                                {person.displayName || 'Unknown'} — {sbuLabel(person.sbu)}, Level {person.clearanceLevel}
                                            </option>
                                        ))}
                                    </select>
                                    {!employeesLoading && !employeesError && employees.length === 0 && (
                                        <p className="mt-2 text-xs text-slate-400">No employees are available to tap a badge.</p>
                                    )}
                                    {isAdmin && employeesTotal > employees.length && (
                                        <p className="mt-2 text-xs text-slate-400">
                                            Showing the {EMPLOYEE_LIMIT} most recent of {employeesTotal} identities.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label htmlFor="pacs-reader" className={labelClass}>Reader ID (optional)</label>
                                    <input
                                        id="pacs-reader"
                                        type="text"
                                        value={readerId}
                                        maxLength={64}
                                        onChange={(e) => setReaderId(e.target.value)}
                                        placeholder="DEMO-SIMULATOR"
                                        className={fieldClass}
                                    />
                                </div>

                                {(selectedZone || selectedEmployee) && (
                                    <dl className="grid grid-cols-2 gap-3 rounded-lg border border-[#b9dcef] bg-white/70 p-3 text-xs">
                                        <div>
                                            <dt className="text-slate-500">Zone requires</dt>
                                            <dd className="font-bold text-white">
                                                {selectedZone ? `Level ${selectedZone.requiredClearance} · ${sbuLabel(selectedZone.sbu)}` : '—'}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-slate-500">Employee holds</dt>
                                            <dd className="font-bold text-white">
                                                {selectedEmployee ? `Level ${selectedEmployee.clearanceLevel} · ${sbuLabel(selectedEmployee.sbu)}` : '—'}
                                            </dd>
                                        </div>
                                    </dl>
                                )}

                                {!zoneStillListed && (
                                    <p className="text-xs text-red-500" role="alert">The selected zone is no longer available.</p>
                                )}
                                {tapError && (
                                    <div className="rounded-lg border border-red-500/40 p-3 text-xs text-red-500" role="alert">{tapError}</div>
                                )}

                                <button
                                    type="submit"
                                    disabled={tapping || !zoneId || !employeeId || !zoneStillListed}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1E5FA8] hover:bg-[#164a85] disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-black uppercase tracking-widest rounded transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">contactless</span>
                                    {tapping ? 'Reading badge…' : 'Tap badge'}
                                </button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Result — always mounted so screen readers announce the outcome */}
                    <div aria-live="polite" aria-atomic="true" aria-busy={tapping}>
                        {tapping && (
                            <div className="rounded-xl border border-[#b9dcef] bg-white/80 p-6 text-center text-sm text-slate-400 animate-pulse">
                                Checking access on-chain…
                            </div>
                        )}
                        {!tapping && result && <ResultCard result={result} event={resultEvent} />}
                        {!tapping && !result && (
                            <div className="rounded-xl border border-dashed border-[#b9dcef] bg-white/50 p-6 text-center text-sm text-slate-400">
                                The turnstile result will appear here after a tap.
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Zones ── */}
                <div className="lg:col-span-3">
                    <Card goldAccent={false}>
                        <CardHeader>
                            <CardTitle>Facility Zones</CardTitle>
                            <span className="text-xs text-slate-400">{isAdmin ? 'Lockdown controls enabled' : 'Read-only lockdown state'}</span>
                        </CardHeader>
                        <CardContent>
                            {zonesError && (
                                <div className="mb-4 rounded-lg border border-red-500/40 p-4 text-sm text-red-500" role="alert">
                                    <p className="font-bold">Unable to load facility zones</p>
                                    <p className="mt-1 text-xs">{zonesError}</p>
                                    <button type="button" onClick={() => loadLive({ manual: true })} className="mt-3 text-xs font-bold underline">Retry</button>
                                </div>
                            )}
                            {loading ? (
                                <p className="py-8 text-center text-slate-400 animate-pulse" role="status">Loading facility zones…</p>
                            ) : zones.length === 0 ? (
                                !zonesError && (
                                    <p className="py-8 text-center text-slate-400">
                                        No facility zones are configured{isAdmin ? '' : ' for your division'} yet.
                                    </p>
                                )
                            ) : (
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {zones.map((zone) => (
                                        <li key={zone.zoneId}>
                                            <ZoneCard
                                                zone={zone}
                                                selected={zone.zoneId === zoneId}
                                                canToggleLockdown={isAdmin}
                                                onSelect={() => setZoneId(zone.zoneId)}
                                                onToggleLockdown={() => setLockdownTarget({ zone, locked: !zone.isEmergencyLocked })}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* ── Recent events ── */}
            <Card goldAccent={false}>
                <CardHeader>
                    <div>
                        <CardTitle>Recent Badge Events</CardTitle>
                        <p className="mt-1 text-xs text-slate-400">
                            Auto-refreshes every {POLL_INTERVAL_MS / 1000}s while this tab is visible
                            {lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => loadLive({ manual: true })}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#b9dcef] bg-white/70 hover:bg-white text-xs font-bold text-[#175887] rounded transition-colors disabled:opacity-60"
                    >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">refresh</span>
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                </CardHeader>
                <CardContent>
                    {eventsError && (
                        <div className="mb-4 rounded-lg border border-red-500/40 p-4 text-sm text-red-500" role="alert">
                            <p className="font-bold">Unable to load badge events</p>
                            <p className="mt-1 text-xs">{eventsError}</p>
                            <button type="button" onClick={() => loadLive({ manual: true })} className="mt-3 text-xs font-bold underline">Retry</button>
                        </div>
                    )}
                    {loading ? (
                        <p className="py-8 text-center text-slate-400 animate-pulse" role="status">Loading badge events…</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <caption className="sr-only">Most recent PACS badge events, newest first</caption>
                                    <thead className="text-xs uppercase text-[#D4AF37] border-b border-[#1F293D]">
                                        <tr>
                                            <th scope="col" className="px-4 py-3">Time</th>
                                            <th scope="col" className="px-4 py-3">Employee</th>
                                            <th scope="col" className="px-4 py-3">Zone</th>
                                            <th scope="col" className="px-4 py-3">Reader</th>
                                            <th scope="col" className="px-4 py-3">Decision</th>
                                            <th scope="col" className="px-4 py-3">Reason</th>
                                            <th scope="col" className="px-4 py-3">On-chain tx</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#1F293D]">
                                        {events.length === 0 ? (
                                            <tr>
                                                <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                                                    No badge events recorded yet
                                                </td>
                                            </tr>
                                        ) : (
                                            events.map((event) => (
                                                <EventRow key={event.id} event={event} highlight={event.id === result?.badgeEventId} />
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {eventsTotal > events.length && (
                                <p className="mt-3 text-xs text-slate-400">Showing the latest {events.length} of {eventsTotal} events.</p>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {lockdownTarget && (
                <LockdownDialog
                    zone={lockdownTarget.zone}
                    locked={lockdownTarget.locked}
                    busy={lockdownBusy}
                    onConfirm={confirmLockdown}
                    onClose={() => !lockdownBusy && setLockdownTarget(null)}
                />
            )}
        </div>
    );
}

function DecisionBadge({ decision }) {
    const granted = decision === 'GRANTED';
    return (
        <span
            className={`inline-block rounded px-2 py-0.5 text-[10px] font-black tracking-wider ${
                granted ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}
        >
            {decision}
        </span>
    );
}

function ZoneCard({ zone, selected, canToggleLockdown, onSelect, onToggleLockdown }) {
    const locked = zone.isEmergencyLocked;
    return (
        <div
            className={`h-full rounded-lg border p-4 space-y-3 ${
                locked ? 'border-red-300 bg-red-50' : 'border-[#b9dcef] bg-white/70'
            } ${selected ? 'ring-2 ring-[#1E5FA8]' : ''}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-white">{zone.name}</h4>
                    <p className="font-mono text-[10px] text-slate-400">{zone.zoneId}</p>
                </div>
                <span
                    className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-black tracking-wider ${
                        locked ? 'bg-red-600 text-[#ffffff]' : 'bg-emerald-100 text-emerald-800'
                    }`}
                >
                    {locked ? 'LOCKDOWN' : 'NORMAL'}
                </span>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <dt className="text-slate-500">Required clearance</dt>
                    <dd className="font-bold text-white">Level {zone.requiredClearance}</dd>
                </div>
                <div>
                    <dt className="text-slate-500">SBU</dt>
                    <dd className="font-bold text-white">{sbuLabel(zone.sbu)}</dd>
                </div>
            </dl>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={onSelect}
                    aria-pressed={selected}
                    className={`px-3 py-1.5 rounded border text-xs font-bold transition-colors ${
                        selected
                            ? 'border-[#1E5FA8] bg-[#1E5FA8] text-white'
                            : 'border-[#b9dcef] bg-white/70 text-[#175887] hover:bg-white'
                    }`}
                >
                    {selected ? 'Selected for tap' : 'Select for tap'}
                </button>
                {canToggleLockdown && (
                    <button
                        type="button"
                        onClick={onToggleLockdown}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                            locked
                                ? 'border border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50'
                                : 'bg-red-600 hover:bg-red-500 text-[#ffffff]'
                        }`}
                    >
                        {locked ? 'Lift lockdown' : 'Emergency lockdown'}
                    </button>
                )}
            </div>
        </div>
    );
}

function ResultCard({ result, event }) {
    const granted = result.allowed;
    const info = describeReason(result.reason, result.zone, result.employee);
    const txHash = event?.onChainTxHash;

    return (
        <div
            className={`rounded-xl border-2 p-6 space-y-4 ${
                granted ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-red-400 bg-red-50 text-red-900'
            }`}
        >
            <div className="flex items-center gap-4">
                <span
                    className={`material-symbols-outlined text-[56px] ${granted ? 'text-emerald-600' : 'text-red-600'}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                    aria-hidden="true"
                >
                    {granted ? 'check_circle' : 'cancel'}
                </span>
                <div>
                    <p className="text-3xl font-black tracking-wide">{granted ? 'ACCESS GRANTED' : 'ACCESS DENIED'}</p>
                    <p className="text-sm font-semibold">
                        {granted ? 'Turnstile unlocked' : 'Turnstile remains locked'} — {result.zone?.name}
                    </p>
                </div>
            </div>

            <div className="rounded-lg bg-white/70 p-3 text-sm">
                <p className="font-bold">{info.title}</p>
                <p className="mt-1 text-xs">{info.detail}</p>
                {!granted && result.reason && (
                    <p className="mt-2 break-words font-mono text-[10px] opacity-80">Reason code: {result.reason}</p>
                )}
            </div>

            <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                    <dt className="opacity-70">Employee</dt>
                    <dd className="font-bold">{result.employee?.displayName || 'Unknown'}</dd>
                </div>
                <div>
                    <dt className="opacity-70">Reader</dt>
                    <dd className="font-bold">{result.readerId}</dd>
                </div>
                <div>
                    <dt className="opacity-70">Time</dt>
                    <dd className="font-bold">{formatTime(result.scannedAt)}</dd>
                </div>
                <div>
                    <dt className="opacity-70">On-chain audit tx</dt>
                    <dd className="font-bold">
                        {txHash ? (
                            <a
                                href={explorerTxUrl(txHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono underline"
                            >
                                {shortHash(txHash)}
                            </a>
                        ) : (
                            <span className="font-normal">Pending or not recorded</span>
                        )}
                    </dd>
                </div>
            </dl>
        </div>
    );
}

function EventRow({ event, highlight }) {
    const info = event.decision === 'DENIED' ? describeReason(event.denialReason) : null;
    return (
        <tr className={`transition-colors ${highlight ? 'bg-[#eaf5ff]' : ''}`}>
            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatTime(event.scannedAt)}</td>
            <td className="px-4 py-3">
                <div className="text-xs font-medium text-white">{event.employee?.displayName || 'Unknown'}</div>
                <div className="text-[10px] text-slate-400">
                    {event.employee ? `${sbuLabel(event.employee.sbu)} · Level ${event.employee.clearanceLevel}` : ''}
                </div>
            </td>
            <td className="px-4 py-3 text-xs">
                <div className="font-medium text-white">{event.zoneName || event.zoneId}</div>
                <div className="font-mono text-[10px] text-slate-400">{event.zoneId}</div>
            </td>
            <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{event.readerId}</td>
            <td className="px-4 py-3"><DecisionBadge decision={event.decision} /></td>
            <td className="px-4 py-3 text-xs text-slate-400 max-w-[220px]" title={event.denialReason || undefined}>
                {info ? info.title : '—'}
            </td>
            <td className="px-4 py-3 font-mono text-[11px]">
                {event.onChainTxHash ? (
                    <a
                        href={explorerTxUrl(event.onChainTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#175887] underline"
                    >
                        {shortHash(event.onChainTxHash)}
                    </a>
                ) : (
                    <span className="text-slate-400">—</span>
                )}
            </td>
        </tr>
    );
}

function LockdownDialog({ zone, locked, busy, onConfirm, onClose }) {
    const dialogRef = useModalA11y(onClose);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="lockdown-title"
                aria-describedby="lockdown-desc"
                className="bg-white border border-[#b9dcef] rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl"
            >
                <h2 id="lockdown-title" className="text-xl font-black text-[#0d2b4e]">
                    {locked ? 'Enable emergency lockdown?' : 'Lift emergency lockdown?'}
                </h2>
                <p id="lockdown-desc" className="text-sm text-[#466983]">
                    {locked
                        ? `Every badge tap at ${zone.name} will be denied, regardless of clearance or SBU, until the lockdown is lifted. This submits an on-chain transaction when the contract is configured.`
                        : `Badge taps at ${zone.name} will be evaluated normally again. This submits an on-chain transaction when the contract is configured.`}
                </p>
                <div className="flex gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="flex-1 px-4 py-2 border border-[#b9dcef] text-[#466983] hover:bg-[#eaf5ff] rounded font-bold text-sm transition-colors disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`flex-1 px-4 py-2 text-[#ffffff] font-bold rounded transition-colors disabled:opacity-60 ${
                            locked ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                    >
                        {busy ? 'Submitting…' : locked ? 'Enable lockdown' : 'Lift lockdown'}
                    </button>
                </div>
            </div>
        </div>
    );
}
