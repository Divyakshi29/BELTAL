import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { auditApi } from '../../services/api';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import useModalA11y from '../../hooks/useModalA11y';
import { useToast } from '../../components/ui/Toast';
import {
    AUDIT_EVENT_TYPES,
    getActionIcon,
    getActionColor,
    isChainTxHash,
    formatAuditDate,
} from '../../config/auditEvents';

export default function AuditTrailExplorer() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [total, setTotal] = useState(0);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [pagination, setPagination] = useState({ page: 1, limit: 20 });
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();

    const [filters, setFilters] = useState({
        actor: '',
        actionType: '',
        asset: '',
        startDate: '',
        endDate: '',
    });

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {
                ...filters,
                page: pagination.page,
                limit: pagination.limit,
            };
            // Remove empty filters
            Object.keys(params).forEach(key => {
                if (!params[key]) delete params[key];
            });

            const data = await auditApi.list(params);
            setEvents(data.events);
            setTotal(data.pagination?.total ?? 0);
        } catch (err) {
            console.error("Failed to fetch audit events", err);
            setError(err?.uiMessage || 'The audit service could not be reached. Check that the backend is running and has been restarted after database configuration changes.');
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.page, pagination.limit]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    // Deep link: "?event=<id>" opens that event's detail modal on load, fetched
    // fresh via GET /audit/:id rather than assumed to be on the current page.
    const deepLinkId = searchParams.get('event');
    useEffect(() => {
        if (!deepLinkId || selectedEvent?.id === deepLinkId) return;
        let cancelled = false;
        auditApi.getById(deepLinkId)
            .then((event) => { if (!cancelled) setSelectedEvent(event); })
            .catch((err) => {
                if (cancelled) return;
                console.error('Failed to load linked audit event', err);
                toast.error(err?.uiMessage || 'That audit event could not be found.', 'Link unavailable');
                setSearchParams((prev) => { prev.delete('event'); return prev; }, { replace: true });
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deepLinkId]);

    const openEvent = (event) => {
        setSelectedEvent(event);
        setSearchParams((prev) => { prev.set('event', event.id); return prev; });
    };

    const closeEvent = () => {
        setSelectedEvent(null);
        setSearchParams((prev) => { prev.delete('event'); return prev; });
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
    };

    const clearFilters = () => {
        setFilters({ actor: '', actionType: '', asset: '', startDate: '', endDate: '' });
        setPagination({ page: 1, limit: 20 });
    };

    const totalPages = Math.ceil(total / pagination.limit);

    return (
        <div className="role-console audit-explorer min-h-full p-5 sm:p-8 space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="h-px w-12 bg-gradient-to-r from-[#D4AF37]/40 to-transparent" />
                    <span className="text-[9px] font-black tracking-[0.22em] text-[#D4AF37]/60 uppercase">
                        ◈ AUDITOR CLEARANCE — READ-ONLY ACCESS
                    </span>
                </div>
                <h1 className="text-2xl font-black text-white tracking-wide">Audit Trail Explorer</h1>
                <p className="text-sm text-slate-400">Filterable, paginated audit log with detailed event inspection</p>
            </div>

            {/* Filters */}
            <Card goldAccent={false} className="audit-surface">
                <CardHeader>
                    <div><CardTitle>Filter Audit Events</CardTitle><p className="mt-1 text-xs text-slate-500">Narrow the ledger using any combination of fields.</p></div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="explorer-actor" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Actor ID
                            </label>
                            <input
                                id="explorer-actor"
                                type="text"
                                placeholder="Identity ID of the actor..."
                                value={filters.actor}
                                onChange={(e) => handleFilterChange('actor', e.target.value)}
                                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-[#D4AF37] outline-none"
                            />
                        </div>

                        <div>
                            <label htmlFor="explorer-action" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Action Type
                            </label>
                            <select
                                id="explorer-action"
                                value={filters.actionType}
                                onChange={(e) => handleFilterChange('actionType', e.target.value)}
                                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-[#D4AF37] outline-none"
                            >
                                <option value="">All Actions</option>
                                {AUDIT_EVENT_TYPES.map((type) => (
                                    <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="explorer-asset" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Asset / Target ID
                            </label>
                            <input
                                id="explorer-asset"
                                type="text"
                                placeholder="Asset or zone ID..."
                                value={filters.asset}
                                onChange={(e) => handleFilterChange('asset', e.target.value)}
                                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-[#D4AF37] outline-none"
                            />
                        </div>

                        <div>
                            <label htmlFor="explorer-start-date" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Start Date
                            </label>
                            <input
                                id="explorer-start-date"
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-[#D4AF37] outline-none"
                            />
                        </div>

                        <div>
                            <label htmlFor="explorer-end-date" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                End Date
                            </label>
                            <input
                                id="explorer-end-date"
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-[#D4AF37] outline-none"
                            />
                        </div>

                        <div className="flex items-end">
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="audit-clear-button w-full px-4 py-2 text-xs font-bold rounded transition-colors"
                            >
                                Clear All Filters
                            </button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Audit Events Table */}
            <Card goldAccent={false} className="audit-surface audit-events-card">
                <CardHeader>
                    <div className="flex w-full items-center justify-between gap-3"><div><CardTitle>Audit Events</CardTitle><p className="mt-1 text-xs text-slate-500">Select a record to inspect its complete, immutable payload.</p></div><span className="audit-count">{loading ? 'SYNCING' : `${total} TOTAL`}</span></div>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="audit-error-state mb-4 flex items-start gap-3 rounded-lg border p-4 text-sm" role="alert">
                            <span className="audit-error-icon material-symbols-outlined">error</span>
                            <div>
                                <p className="audit-error-title font-bold">Unable to load the audit trail</p>
                                <p className="audit-error-message mt-1 text-xs">{error}</p>
                                <button type="button" onClick={fetchEvents} className="audit-error-retry mt-3 text-xs font-bold underline">Retry</button>
                            </div>
                        </div>
                    )}
                    {loading ? (
                        <p className="text-slate-400 text-center py-8">Loading audit trail...</p>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="audit-table w-full text-left text-sm text-slate-300">
                                    <thead className="text-xs uppercase text-[#D4AF37] border-b border-[#1F293D]">
                                        <tr>
                                            <th className="px-4 py-3">Action</th>
                                            <th className="px-4 py-3">Actor</th>
                                            <th className="px-4 py-3">Entity</th>
                                            <th className="px-4 py-3">TX Hash</th>
                                            <th className="px-4 py-3">Timestamp</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#1F293D]">
                                        {events.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                                                    No audit events found for selected filters
                                                </td>
                                            </tr>
                                        ) : (
                                            events.map((event) => (
                                                <tr
                                                    key={event.id}
                                                    onClick={() => openEvent(event)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            openEvent(event);
                                                        }
                                                    }}
                                                    tabIndex={0}
                                                    aria-label={`Inspect ${event.actionType?.replace(/_/g, ' ')} event`}
                                                    className="hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1E5FA8]"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`material-symbols-outlined text-[18px] ${getActionColor(event.actionType)}`}>
                                                                {getActionIcon(event.actionType)}
                                                            </span>
                                                            <span className="text-xs font-bold text-white">
                                                                {event.actionType?.replace(/_/g, ' ')}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="text-xs">
                                                            <div className="text-white font-medium">
                                                                {event.performedBy?.displayName || 'System'}
                                                            </div>
                                                            <div className="text-slate-500 font-mono text-[10px]">
                                                                {event.performedBy?.walletAddress?.slice(0, 6)}...
                                                                {event.performedBy?.walletAddress?.slice(-4)}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs">
                                                        <div className="text-white">{event.entityName || 'N/A'}</div>
                                                        <div className="text-slate-500 text-[10px]">{event.entityId}</div>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-[10px] text-slate-400">
                                                        {event.txHash?.slice(0, 10)}...{event.txHash?.slice(-8)}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-slate-400">
                                                        {formatAuditDate(event.timestamp, { seconds: true })}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-[#1F293D]">
                                    <div className="text-xs text-slate-400">
                                        Showing <span className="font-bold text-slate-300">{(pagination.page - 1) * pagination.limit + 1}</span>
                                        {' '}-{' '}
                                        <span className="font-bold text-slate-300">{Math.min(pagination.page * pagination.limit, total)}</span>
                                        {' '}of{' '}
                                        <span className="font-bold text-slate-300">{total}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                                            disabled={pagination.page === 1}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#1E5FA8] text-[#1E5FA8] text-xs font-bold transition-colors hover:bg-[#1E5FA8] hover:text-white disabled:cursor-not-allowed disabled:border-[#D7E0EA] disabled:text-slate-400 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                        >
                                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
                                            Previous
                                        </button>
                                        <span className="px-3 py-1.5 text-xs font-bold text-slate-400">
                                            Page {pagination.page} of {totalPages}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setPagination(prev => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                                            disabled={pagination.page === totalPages}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#1E5FA8] text-[#1E5FA8] text-xs font-bold transition-colors hover:bg-[#1E5FA8] hover:text-white disabled:cursor-not-allowed disabled:border-[#D7E0EA] disabled:text-slate-400 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                        >
                                            Next
                                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Event Detail Modal */}
            {selectedEvent && (
                <EventDetailModal
                    event={selectedEvent}
                    onClose={closeEvent}
                />
            )}
        </div>
    );
}

// Event Detail Modal Component
function EventDetailModal({ event, onClose }) {
    const dialogRef = useModalA11y(onClose);
    const toast = useToast();

    const copyLink = async () => {
        const url = `${window.location.origin}${window.location.pathname}?event=${event.id}`;
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copied — anyone with Auditor/Admin access can open this exact event.', 'Copied');
        } catch {
            toast.error('Could not copy automatically. The link is in your address bar.', 'Copy failed');
        }
    };

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="event-detail-title"
                className="bg-[#0D1F38] border border-[#1F293D] rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            >
                <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-[#1F293D]">
                        <h2 id="event-detail-title" className="text-xl font-black text-white">Event Details</h2>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={copyLink}
                                className="inline-flex items-center gap-1 text-xs font-bold text-[#1E5FA8] hover:text-[#7ab0fe] transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">link</span>
                                Copy link
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close event details"
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                    </div>

                    {/* Event Info */}
                    <div className="space-y-3">
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Action Type</div>
                            <div className="text-white font-bold">{event.actionType}</div>
                        </div>

                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Timestamp</div>
                            <div className="text-white">{formatAuditDate(event.timestamp, { seconds: true })}</div>
                        </div>

                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Performed By</div>
                            <div className="text-white">{event.performedBy?.displayName || 'System'}</div>
                            <div className="text-slate-400 font-mono text-xs mt-1">
                                {event.performedBy?.walletAddress}
                            </div>
                        </div>

                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Entity</div>
                            <div className="text-white">{event.entityName || 'N/A'}</div>
                            <div className="text-slate-400 font-mono text-xs mt-1">{event.entityId}</div>
                        </div>

                        {event.txHash && (
                            <div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Transaction Hash</div>
                                <div className="text-emerald-400 font-mono text-xs break-all">{event.txHash}</div>
                                {isChainTxHash(event.txHash) && (
                                    <a
                                        href={`https://sepolia.etherscan.io/tx/${event.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[#1E5FA8] hover:text-[#7ab0fe] text-xs mt-1 inline-block"
                                    >
                                        View on Etherscan →
                                    </a>
                                )}
                            </div>
                        )}

                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Block Number</div>
                            <div className="text-white">{event.blockNumber || 'N/A'}</div>
                        </div>

                        {/* Full Payload */}
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Full Event Payload</div>
                            <pre className="bg-[#060D1A] border border-[#1F293D] rounded p-3 text-xs text-slate-300 overflow-x-auto">
                                {JSON.stringify(event.payload || event, null, 2)}
                            </pre>
                        </div>
                    </div>

                    {/* Close Button */}
                    <div className="pt-4 border-t border-[#1F293D]">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full px-4 py-2 bg-[#1E5FA8] hover:bg-[#164a85] text-white font-bold rounded transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
