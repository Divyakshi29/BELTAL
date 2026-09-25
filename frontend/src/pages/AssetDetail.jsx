import { useParams, useNavigate, Link } from 'react-router-dom';
import useAssetDetail from '../hooks/useAssetDetail';
import { useAuth } from '../context/AuthContext';
import Card, { CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { TierBadge, CustodyBadge } from '../components/ui/Badge';

const isApproved = (status) => status === 'APPROVED' || status === 'EXECUTED';

/**
 * Shared asset detail screen (issues #66/#68). Routed at /assets/:id for every
 * authenticated role — an admin auditing the ledger, a manager reviewing team
 * equipment and the custodian themselves all read the same record, so the page
 * only varies the breadcrumb it returns to and whether the custodian-only
 * "Request Transfer" action is offered.
 */
const BACK_BY_ROLE = {
    ADMIN: { to: '/admin/assets', label: 'Asset Ledger' },
    MANAGER: { to: '/team-assets', label: 'Team Assets' },
    AUDITOR: { to: '/audit/explorer', label: 'Audit Trail' },
    USER: { to: '/my-assets', label: 'My Assets' },
};

export default function AssetDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { asset, history, loading, error } = useAssetDetail(id);

    const back = BACK_BY_ROLE[user?.role] || BACK_BY_ROLE.USER;
    // Only the current custodian can raise a transfer request for an asset —
    // and only via this button for a plain USER. /transfer/request is a
    // USER-only route (App.jsx), so a manager/admin who happens to be a
    // custodian would hit "access denied" here; they start a transfer from
    // the Initiate Transfer screen instead, which they always have access to.
    const canRequestTransfer =
        user?.role === 'USER' &&
        Boolean(asset) && asset.owner?.walletAddress === user?.walletAddress;

    // Custody status isn't a stored field on the asset (see asset.service.js
    // `getAssetById`) — it's derived here the same way `MyAssets.jsx` does it,
    // from whether there's a live PENDING transfer request against this asset.
    const custodyPending = Boolean(
        asset?.transferRequests?.some((tr) => tr.status === 'PENDING')
    );

    if (loading) {
        return (
            <div className="user-console p-6 flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="inline-block w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-400 mt-3 text-sm">Loading asset details...</p>
                </div>
            </div>
        );
    }

    if (!asset) {
        return (
            <div className="user-console p-6">
                <Card goldAccent={false}>
                    <CardContent>
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-6xl text-red-500/50 mb-3">
                                error
                            </span>
                            <p className="text-slate-400 text-sm" role={error ? 'alert' : undefined}>{error || 'Asset not found'}</p>
                            <button
                                onClick={() => navigate(back.to)}
                                className="mt-4 px-4 py-2 bg-[#1E5FA8] hover:bg-[#164a85] text-white text-xs font-bold rounded"
                            >
                                Back to {back.label}
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="user-console min-h-full p-6 sm:p-8 space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
                <Link to={back.to} className="hover:text-emerald-400 transition-colors">
                    {back.label}
                </Link>
                <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                <span className="text-white font-medium truncate max-w-[300px]">
                    {asset.name}
                </span>
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="h-px w-12 bg-gradient-to-r from-emerald-500/40 to-transparent" />
                        <span className="text-[9px] font-black tracking-[0.22em] text-emerald-500/60 uppercase">
                            ASSET DETAIL VIEW
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-wide truncate">
                        {asset.name}
                    </h1>
                    <p className="text-sm text-slate-400 mt-1 font-mono">
                        ID: {asset.id}
                    </p>
                </div>
                <div className="flex gap-2">
                    {canRequestTransfer && (
                        <button
                            onClick={() => navigate(`/transfer/request?asset=${asset.id}`)}
                            className="px-4 py-2 bg-[#1E5FA8] hover:bg-[#164a85] text-white text-xs font-bold rounded transition-colors"
                        >
                            Request Transfer
                        </button>
                    )}
                    <button
                        onClick={() => navigate(back.to)}
                        className="px-4 py-2 border border-[#1F293D] hover:border-emerald-500/50 text-slate-300 text-xs font-bold rounded transition-colors"
                    >
                        Back
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Info */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Metadata */}
                    <Card goldAccent={false}>
                        <CardHeader>
                            <CardTitle>Asset Metadata</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-3 rounded bg-[#0D1F38] border border-[#1F293D]">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Custody Status</div>
                                    <CustodyBadge pending={custodyPending} />
                                </div>

                                <div className="p-3 rounded bg-[#0D1F38] border border-[#1F293D]">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Token ID</div>
                                    <div className="text-white text-sm font-bold font-mono">
                                        {asset.tokenId || 'Pending on-chain confirmation'}
                                    </div>
                                </div>

                                <div className="p-3 rounded bg-[#0D1F38] border border-[#1F293D]">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Classification Tier</div>
                                    <TierBadge tier={asset.classificationTier} className="text-xs" />
                                </div>

                                <div className="p-3 rounded bg-[#0D1F38] border border-[#1F293D]">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Current Custodian</div>
                                    <div className="text-white text-sm font-bold truncate">
                                        {asset.owner?.displayName || 'Unassigned'}
                                    </div>
                                    <div className="text-slate-500 font-mono text-[10px] mt-0.5 truncate">
                                        {asset.owner?.walletAddress || 'N/A'}
                                    </div>
                                </div>

                                <div className="p-3 rounded bg-[#0D1F38] border border-[#1F293D]">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Minted On</div>
                                    <div className="text-white text-sm font-bold">
                                        {new Date(asset.createdAt).toLocaleString('en-IN')}
                                    </div>
                                </div>

                                <div className="p-3 rounded bg-[#0D1F38] border border-[#1F293D]">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">SBU</div>
                                    <div className="text-white text-sm font-bold">
                                        {asset.sbu?.replace('SBU_', '') || 'N/A'}
                                    </div>
                                </div>
                            </div>

                            {asset.metadata && (
                                <div className="mt-4">
                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Additional Metadata</div>
                                    <pre className="bg-[#060D1A] border border-[#1F293D] rounded p-3 text-xs text-slate-300 overflow-x-auto">
                                        {JSON.stringify(asset.metadata, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Ownership History Timeline */}
                    <Card goldAccent={false}>
                        <CardHeader>
                            <CardTitle>Ownership History Timeline</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {history.length === 0 ? (
                                <div className="text-center py-8">
                                    <span className="material-symbols-outlined text-5xl text-slate-600 mb-2">
                                        history
                                    </span>
                                    <p className="text-slate-400 text-sm">No transfer history yet</p>
                                    <p className="text-slate-500 text-xs mt-1">This asset hasn't been transferred</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {history.map((transfer, index) => (
                                        <div key={transfer.id} className="relative pl-8 pb-4 last:pb-0">
                                            {/* Timeline line */}
                                            {index < history.length - 1 && (
                                                <div className="absolute left-[11px] top-6 bottom-0 w-px bg-[#1F293D]"></div>
                                            )}
                                            {/* Timeline dot */}
                                            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-[#1E5FA8] border-2 border-[#060D1A] flex items-center justify-center">
                                                <span className="material-symbols-outlined text-[12px] text-white">
                                                    {isApproved(transfer.status) ? 'check' : transfer.status === 'REJECTED' ? 'close' : 'pending'}
                                                </span>
                                            </div>
                                            {/* Content */}
                                            <div className="bg-[#0D1F38] border border-[#1F293D] rounded p-3">
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-bold text-white">
                                                            {transfer.fromUser?.displayName || 'Unknown'}
                                                            <span className="text-slate-500 font-normal"> → </span>
                                                            {transfer.toUser?.displayName || 'Unknown'}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                                            {new Date(transfer.createdAt).toLocaleString('en-IN')}
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${isApproved(transfer.status)
                                                        ? 'bg-green-100 text-green-800 border-green-300'
                                                        : transfer.status === 'REJECTED'
                                                            ? 'bg-red-100 text-red-800 border-red-300'
                                                            : 'bg-amber-100 text-amber-800 border-amber-300'
                                                        }`}>
                                                        {transfer.status}
                                                    </span>
                                                </div>
                                                {transfer.reason && (
                                                    <div className="text-xs text-slate-400 italic">
                                                        "{transfer.reason}"
                                                    </div>
                                                )}
                                                {transfer.txHash && (
                                                    <div className="mt-2 pt-2 border-t border-[#1F293D]">
                                                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">TX Hash</div>
                                                        <div className="text-emerald-400 font-mono text-[10px] break-all">
                                                            {transfer.txHash}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar Info */}
                <div className="space-y-4">
                    <Card goldAccent={false}>
                        <CardHeader>
                            <CardTitle>Quick Info</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Asset ID</div>
                                <div className="text-xs text-white font-mono break-all">{asset.id}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Owner Wallet</div>
                                <div className="text-xs text-white font-mono break-all">
                                    {asset.owner?.walletAddress || 'N/A'}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Last Updated</div>
                                <div className="text-xs text-white">
                                    {new Date(asset.updatedAt || asset.createdAt).toLocaleString('en-IN')}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card goldAccent={false}>
                        <CardHeader>
                            <CardTitle>Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {canRequestTransfer && (
                                <button
                                    onClick={() => navigate(`/transfer/request?asset=${asset.id}`)}
                                    className="w-full px-3 py-2 bg-[#1E5FA8] hover:bg-[#164a85] text-white text-xs font-bold rounded transition-colors"
                                >
                                    Request Transfer
                                </button>
                            )}
                            {(user?.role === 'ADMIN' || user?.role === 'AUDITOR') && (
                                <button
                                    onClick={() => navigate(`/audit/verify?asset=${asset.id}`)}
                                    className="w-full px-3 py-2 border border-[#1F293D] hover:border-emerald-500/50 text-slate-300 text-xs font-bold rounded transition-colors"
                                >
                                    Verify on-chain
                                </button>
                            )}
                            <button
                                onClick={() => navigate(back.to)}
                                className="w-full px-3 py-2 border border-[#1F293D] hover:border-emerald-500/50 text-slate-300 text-xs font-bold rounded transition-colors"
                            >
                                Back to {back.label}
                            </button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
