import { useState, useEffect, useCallback } from 'react';
import { auditApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import AuditAssistantPanel from '../../components/auditor/AuditAssistantPanel';
import useBlockNumber from '../../hooks/useBlockNumber';
import {
    AUDIT_EVENT_TYPES,
    getActionIcon,
    getActionColor,
    formatAuditDate,
} from '../../config/auditEvents';

export default function AuditorDashboard() {
    const { user } = useAuth();
    const toast = useToast();
    const [stats, setStats] = useState({
        identityCreated: 0,
        roleChanged: 0,
        assetMinted: 0,
        transferExecuted: 0,
    });
    const [auditEvents, setAuditEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [verifying, setVerifying] = useState(null);
    const blockNumber = useBlockNumber();
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        actionType: '',
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [statsData, eventsData] = await Promise.all([
                auditApi.getStats(filters),
                auditApi.list({ ...filters, limit: 20 }),
            ]);
            setStats(statsData);
            setAuditEvents(eventsData.events);
        } catch (err) {
            console.error("Failed to load audit data", err);
            setError(err?.uiMessage || 'The audit trail could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleVerify = async (event) => {
        setVerifying(event.id);
        try {
            const result = await auditApi.verify(event.id);
            const message = result.message || (result.verified ? 'Record verified' : 'Record could not be verified');
            if (result.verified) toast.success(message, 'Verified on-chain');
            else toast.warning(message, 'Not verified');
        } catch (err) {
            toast.error(err.uiMessage || err.message, 'Verification failed');
        } finally {
            setVerifying(null);
        }
    };

    const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <div className="role-console auditor-dashboard min-h-full p-5 sm:p-8 space-y-6">
            <section className="auditor-welcome">
                <div className="relative z-10">
                    <div className="auditor-eyebrow"><span className="h-2 w-2 rounded-full bg-[#E8CC71]" /> AUDITOR CLEARANCE · READ-ONLY ACCESS</div>
                    <p className="mt-5 text-sm font-semibold text-[#C5DDF7]">{greeting},</p>
                    <h1>Welcome, <span>{user?.displayName || user?.name || 'Auditor'}</span>.</h1>
                    <p className="auditor-welcome-copy">Monitor ledger activity, verify records, and maintain a trusted audit trail from one clear workspace.</p>
                </div>
                <div className="auditor-status-card relative z-10">
                    <div className="flex items-center justify-between border-b border-white/15 pb-3">
                        <span className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-white"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" /> LEDGER ONLINE</span>
                        <span className="font-mono text-[10px] text-[#C5DDF7]">{blockNumber === null ? 'RPC offline' : `#${blockNumber.toLocaleString()}`}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <div><p className="text-[10px] font-bold tracking-wider text-[#A9BFDE]">ACCESS LEVEL</p><p className="mt-1 text-sm font-bold text-white">Auditor</p></div>
                        <div><p className="text-[10px] font-bold tracking-wider text-[#A9BFDE]">RECENT EVENTS</p><p className="mt-1 text-sm font-bold text-white">{loading ? 'Syncing' : auditEvents.length}</p></div>
                    </div>
                </div>
            </section>

            <h2 className="text-2xl font-black text-white tracking-wide">Auditor Dashboard</h2>
            <p className="text-sm text-slate-400">Audit trail overview and verification tools</p>

            {/* Renders nothing when the server has no assistant configured. */}
            <AuditAssistantPanel />

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card goldAccent={false}>
                    <CardHeader>
                        <CardTitle className="text-xs text-slate-400">Identities Created</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-emerald-400">{stats.identityCreated}</div>
                        <div className="text-[10px] text-slate-500 mt-1">Total registered</div>
                    </CardContent>
                </Card>

                <Card goldAccent={false}>
                    <CardHeader>
                        <CardTitle className="text-xs text-slate-400">Role Changes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-blue-400">{stats.roleChanged}</div>
                        <div className="text-[10px] text-slate-500 mt-1">Clearance updates</div>
                    </CardContent>
                </Card>

                <Card goldAccent={false}>
                    <CardHeader>
                        <CardTitle className="text-xs text-slate-400">Assets Minted</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-amber-400">{stats.assetMinted}</div>
                        <div className="text-[10px] text-slate-500 mt-1">On-chain NFTs</div>
                    </CardContent>
                </Card>

                <Card goldAccent={false}>
                    <CardHeader>
                        <CardTitle className="text-xs text-slate-400">Transfers Executed</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-purple-400">{stats.transferExecuted}</div>
                        <div className="text-[10px] text-slate-500 mt-1">Custody changes</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card goldAccent={false}>
                <CardHeader>
                    <CardTitle>Filter Audit Trail</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="audit-start-date" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Start Date
                            </label>
                            <input
                                id="audit-start-date"
                                type="date"
                                value={filters.startDate}
                                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-[#D4AF37] outline-none"
                            />
                        </div>

                        <div>
                            <label htmlFor="audit-end-date" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                End Date
                            </label>
                            <input
                                id="audit-end-date"
                                type="date"
                                value={filters.endDate}
                                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                                className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-[#D4AF37] outline-none"
                            />
                        </div>

                        <div>
                            <label htmlFor="audit-action-type" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                Action Type
                            </label>
                            <select
                                id="audit-action-type"
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
                    </div>

                    <button
                        type="button"
                        onClick={() => setFilters({ startDate: '', endDate: '', actionType: '' })}
                        className="mt-4 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white border border-[#1F293D] hover:border-[#D4AF37] rounded transition-colors"
                    >
                        Clear Filters
                    </button>
                </CardContent>
            </Card>

            {/* Audit Events Table */}
            <Card goldAccent={false}>
                <CardHeader>
                    <CardTitle>Recent Audit Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    {error && (
                        <div className="mb-4 rounded-lg border border-red-500/40 p-4 text-sm text-red-400" role="alert">
                            <p className="font-bold">Unable to load the audit trail</p>
                            <p className="mt-1 text-xs">{error}</p>
                            <button type="button" onClick={loadData} className="mt-3 text-xs font-bold underline">Retry</button>
                        </div>
                    )}
                    {loading ? (
                        <p className="text-slate-400 text-center py-8">Loading audit trail...</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="text-xs uppercase text-[#D4AF37] border-b border-[#1F293D]">
                                    <tr>
                                        <th className="px-4 py-3">Action</th>
                                        <th className="px-4 py-3">Entity</th>
                                        <th className="px-4 py-3">Performed By</th>
                                        <th className="px-4 py-3">TX Hash</th>
                                        <th className="px-4 py-3">Timestamp</th>
                                        <th className="px-4 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1F293D]">
                                    {auditEvents.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                                                No audit events found
                                            </td>
                                        </tr>
                                    ) : (
                                        auditEvents.map((event) => (
                                            <tr key={event.id} className="hover:bg-white/5 transition-colors">
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
                                                <td className="px-4 py-3 text-xs">
                                                    <div className="text-white">{event.entityName || 'N/A'}</div>
                                                    <div className="text-slate-500 text-[10px]">{event.entityId}</div>
                                                </td>
                                                <td className="px-4 py-3 text-xs">
                                                    <div className="text-white">{event.performedBy?.displayName || 'System'}</div>
                                                    <div className="text-slate-500 font-mono text-[10px]">
                                                        {event.performedBy?.walletAddress?.slice(0, 6)}...
                                                        {event.performedBy?.walletAddress?.slice(-4)}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-[10px] text-slate-400">
                                                    {event.txHash?.slice(0, 10)}...{event.txHash?.slice(-8)}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-400">
                                                    {formatAuditDate(event.timestamp)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleVerify(event)}
                                                        disabled={verifying === event.id}
                                                        className="px-3 py-1.5 bg-[#1E5FA8] hover:bg-[#164a85] text-white text-xs font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {verifying === event.id ? 'Verifying...' : 'Verify'}
                                                    </button>
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
        </div>
    );
}
