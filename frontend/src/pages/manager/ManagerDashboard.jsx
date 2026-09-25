import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { assetApi, transferApi } from '../../services/api';
import useTeamMembers from '../../hooks/useTeamMembers';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

const STATUS_LABEL = {
    PENDING: 'transfer awaiting approval',
    APPROVED: 'transfer approved',
    EXECUTED: 'custody transferred',
    REJECTED: 'transfer rejected',
};

/** Compact "how long ago" label for the activity feed. */
function timeAgo(date) {
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return days < 30 ? `${days}d ago` : date.toLocaleDateString();
}

export default function ManagerDashboard() {
    const { user } = useAuth();
    const sbu = user?.sbu;
    const navigate = useNavigate();
    const { members, loading: membersLoading, error: membersError } = useTeamMembers(sbu);
    const [stats, setStats] = useState({ totalAssets: 0, pendingTransfers: 0 });
    const [activity, setActivity] = useState([]);
    const [statsLoading, setStatsLoading] = useState(Boolean(sbu));
    const [statsError, setStatsError] = useState(null);
    const loading = membersLoading || statsLoading;
    const error = membersError || statsError;
    const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
    const division = user?.sbu?.replace('SBU_', '') || 'Team';

    const loadTeamStats = useCallback(async () => {
        if (!sbu) return;
        setStatsLoading(true);
        setStatsError(null);
        const [assetsResult, transfersResult] = await Promise.allSettled([
            assetApi.list({ sbu, limit: 100 }),
            // Every status, not just PENDING: the same list feeds the pending
            // count and the activity feed below. /api/transfers is already
            // scoped to this manager's SBU server-side.
            transferApi.list({ limit: 100 }),
        ]);
        const failed = [assetsResult, transfersResult].find((result) => result.status === 'rejected');
        if (failed) {
            console.error('Failed to load manager stats', failed.reason);
            setStatsError(failed.reason?.uiMessage || 'Some team statistics could not be loaded.');
        }
        const assets = assetsResult.status === 'fulfilled' ? assetsResult.value : [];
        const transfers = transfersResult.status === 'fulfilled' ? transfersResult.value : [];
        const divisionTransfers = transfers.filter((transfer) => transfer.asset?.sbu === sbu);
        setStats({
            totalAssets: assets.length,
            pendingTransfers: divisionTransfers.filter((transfer) => transfer.status === 'PENDING').length,
        });

        // Recent team activity, assembled from what a manager is allowed to
        // read. Managers have no access to /api/audit*, so this is built from
        // their own transfer queue and the division's newest assets rather
        // than the on-chain audit trail.
        const feed = [
            ...divisionTransfers.map((transfer) => ({
                id: `transfer-${transfer.id}`,
                at: new Date(transfer.updatedAt || transfer.createdAt),
                icon: transfer.status === 'REJECTED' ? 'block' : transfer.status === 'PENDING' ? 'pending_actions' : 'swap_horiz',
                status: transfer.status,
                title: `${transfer.asset?.name || 'Asset'} · ${STATUS_LABEL[transfer.status] || transfer.status}`,
                detail: `${transfer.fromUser?.displayName || 'Unassigned'} → ${transfer.toUser?.displayName || 'Unknown'}`,
                to: transfer.asset?.id ? `/assets/${transfer.asset.id}` : '/transfers',
            })),
            ...assets.map((asset) => ({
                id: `asset-${asset.id}`,
                at: new Date(asset.createdAt),
                icon: 'add_circle',
                status: 'MINTED',
                title: `${asset.name} minted`,
                detail: `Custodian: ${asset.owner?.displayName || 'Unassigned'}`,
                to: `/assets/${asset.id}`,
            })),
        ]
            .filter((entry) => !Number.isNaN(entry.at.getTime()))
            .sort((a, b) => b.at - a.at)
            .slice(0, 8);
        setActivity(feed);
        setStatsLoading(false);
    }, [sbu]);

    useEffect(() => { loadTeamStats(); }, [loadTeamStats]);

    const teamMembers = members.length;

    if (loading) return <div className="role-console min-h-full p-6 flex justify-center items-center h-64" role="status"><p className="text-slate-400 animate-pulse">Loading team dashboard...</p></div>;

    return <div className="role-console manager-dashboard min-h-full p-5 sm:p-8 space-y-6">
        <section className="manager-welcome">
            <div className="relative z-10">
                <div className="manager-eyebrow"><span className="h-2 w-2 rounded-full bg-[#E8CC71]" /> MANAGER CLEARANCE · {division.toUpperCase()} DIVISION</div>
                <p className="mt-5 text-sm font-semibold text-[#C5DDF7]">{greeting},</p>
                <h1>Welcome, <span>{user?.displayName || user?.name || 'Manager'}</span>.</h1>
                <p className="manager-welcome-copy">Coordinate your team, maintain asset readiness, and keep every custody decision moving with confidence.</p>
            </div>
            <div className="manager-status-card relative z-10">
                <div className="flex items-center justify-between border-b border-white/15 pb-3"><span className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-white"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" /> COMMAND CENTER ONLINE</span><span className="font-mono text-[10px] text-[#C5DDF7]">{division.toUpperCase()}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-[10px] font-bold tracking-wider text-[#A9BFDE]">TEAM SIZE</p><p className="mt-1 text-sm font-bold text-white">{teamMembers}</p></div><div><p className="text-[10px] font-bold tracking-wider text-[#A9BFDE]">AWAITING REVIEW</p><p className="mt-1 text-sm font-bold text-white">{stats.pendingTransfers}</p></div></div>
            </div>
        </section>

        {!user?.sbu && <div className="rounded-lg border border-amber-500/40 p-4 text-sm text-amber-500" role="status">No SBU is assigned to your identity, so team statistics are unavailable.</div>}
        {error && <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/40 p-4 text-sm text-red-400" role="alert"><span>{error}</span><button type="button" onClick={loadTeamStats} className="text-xs font-bold underline">Retry</button></div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <StatCard title="Team Members" icon="groups" variant="team" value={teamMembers} detail={`Active personnel in ${division}`} />
            <StatCard title="Team Assets" icon="inventory_2" variant="assets" value={stats.totalAssets} detail="Items under team custody" />
            <StatCard title="Pending Transfers" icon="pending_actions" variant="pending" value={stats.pendingTransfers} detail="Awaiting your approval" attention />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <Card goldAccent={false} className="manager-panel lg:col-span-3"><CardHeader><div><CardTitle>Command Shortcuts</CardTitle><p className="manager-panel-subtitle">Open the workspaces your team uses most.</p></div></CardHeader><CardContent><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><ActionCard icon="groups" title="Team Members" detail="Manage personnel" onClick={() => navigate('/team')} /><ActionCard icon="inventory_2" title="Team Assets" detail="Review custody" onClick={() => navigate('/team-assets')} /><ActionCard icon="swap_horiz" title="Approvals" detail="Resolve requests" onClick={() => navigate('/transfers')} /></div></CardContent></Card>
            <Card goldAccent={false} className="manager-panel manager-readiness-card lg:col-span-2"><CardHeader><CardTitle>Operational Readiness</CardTitle></CardHeader><CardContent><ReadinessRow icon="verified_user" title="Custody oversight" detail={`${stats.totalAssets} assets are assigned to your division.`} /><ReadinessRow icon="assignment_turned_in" title="Approval queue" detail={stats.pendingTransfers ? `${stats.pendingTransfers} transfer${stats.pendingTransfers === 1 ? '' : 's'} need review.` : 'No transfers need review.'} /></CardContent></Card>
        </div>

        <Card goldAccent={false} className="manager-panel">
            <CardHeader>
                <div>
                    <CardTitle>Recent Team Activity</CardTitle>
                    <p className="manager-panel-subtitle">Custody movements and new equipment across {division}.</p>
                </div>
            </CardHeader>
            <CardContent>
                {activity.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">No recorded activity for your division yet.</p>
                ) : (
                    <ul className="divide-y divide-[#1F293D]">
                        {activity.map((entry) => (
                            <li key={entry.id}>
                                <button
                                    type="button"
                                    onClick={() => navigate(entry.to)}
                                    className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-white/5"
                                >
                                    <span className="material-symbols-outlined shrink-0 text-[20px] text-[#1E5FA8]" aria-hidden="true">{entry.icon}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-bold text-white">{entry.title}</span>
                                        <span className="block truncate text-xs text-slate-400">{entry.detail}</span>
                                    </span>
                                    <span className="shrink-0 font-mono text-[10px] text-slate-500">{timeAgo(entry.at)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    </div>;
}

function StatCard({ title, icon, variant, value, detail, attention = false }) {
    return <Card goldAccent={false} className={`manager-stat-card${attention ? ' manager-stat-card--attention' : ''}`}><CardHeader><div className="flex w-full items-center justify-between"><CardTitle className="text-sm">{title}</CardTitle><span className={`manager-stat-icon manager-stat-icon--${variant} material-symbols-outlined`} aria-hidden="true">{icon}</span></div></CardHeader><CardContent><div className="manager-stat-value">{value}</div><div className="manager-stat-copy">{detail}</div></CardContent></Card>;
}

function ActionCard({ icon, title, detail, onClick }) {
    return <button type="button" onClick={onClick} className="manager-action-card"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span><span><strong>{title}</strong><small>{detail}</small></span><i className="material-symbols-outlined" aria-hidden="true">arrow_forward</i></button>;
}

function ReadinessRow({ icon, title, detail }) {
    return <div className="manager-readiness-row"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}
