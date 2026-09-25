import { useParams, useNavigate } from 'react-router-dom';
import useAssetDetail from '../hooks/useAssetDetail';
import Card, { CardContent, CardHeader, CardTitle } from './ui/Card';
import { TierBadge } from './ui/Badge';

const isApproved = (status) => status === 'APPROVED' || status === 'EXECUTED';

export default function AssetDetailView({ role = 'user' }) {
    const { id } = useParams();
    const navigate = useNavigate();
    const { asset, history, loading, error } = useAssetDetail(id);

    const getStatusColor = (status) => {
        switch (status?.toUpperCase()) {
            case 'ACTIVE': return 'bg-emerald-900/50 text-emerald-400 border-emerald-700';
            case 'INACTIVE': return 'bg-slate-700/50 text-slate-400 border-slate-600';
            case 'MAINTENANCE': return 'bg-amber-900/50 text-amber-400 border-amber-700';
            default: return 'bg-slate-700/50 text-slate-400 border-slate-600';
        }
    };

    // Full class names so Tailwind can detect them at build time.
    const getRoleAccent = () => {
        switch (role) {
            case 'admin': return { line: 'from-blue-500/40', text: 'text-blue-500/60' };
            case 'manager': return { line: 'from-purple-500/40', text: 'text-purple-500/60' };
            case 'auditor': return { line: 'from-amber-500/40', text: 'text-amber-500/60' };
            default: return { line: 'from-emerald-500/40', text: 'text-emerald-500/60' };
        }
    };

    if (loading) {
        return <AssetDetailSkeleton />;
    }

    if (!asset) {
        return (
            <div className="p-6">
                <Card goldAccent={false}>
                    <CardContent>
                        <div className="text-center py-12">
                            <p className="text-slate-400" role={error ? 'alert' : undefined}>{error || 'Asset not found'}</p>
                            <button
                                onClick={() => navigate(-1)}
                                className="mt-4 px-4 py-2 bg-[#1E5FA8] text-white text-xs font-bold rounded"
                            >
                                Go Back
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`h-px w-12 bg-gradient-to-r ${getRoleAccent().line} to-transparent`} />
                        <span className={`text-[9px] font-black tracking-[0.22em] ${getRoleAccent().text} uppercase`}>
                            ASSET DETAIL VIEW
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-wide truncate">{asset.name}</h1>
                    <p className="text-sm text-slate-400 mt-1 font-mono">ID: {asset.id}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card goldAccent={false}>
                        <CardHeader>
                            <CardTitle>Asset Metadata</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InfoBlock label="Status" value={
                                    <span className={`inline-block px-2 py-1 rounded border text-xs font-bold ${getStatusColor(asset.status)}`}>
                                        {asset.status || 'ACTIVE'}
                                    </span>
                                } />
                                <InfoBlock label="Asset Type" value={asset.assetType || 'N/A'} />
                                <InfoBlock label="Classification Tier" value={<TierBadge tier={asset.classificationTier} className="text-xs" />} />
                                <InfoBlock label="Current Custodian" value={asset.owner?.displayName || 'Unassigned'} />
                                <InfoBlock label="Minted On" value={new Date(asset.createdAt).toLocaleString('en-IN')} />
                                <InfoBlock label="SBU" value={asset.sbu?.replace('SBU_', '') || 'N/A'} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card goldAccent={false}>
                        <CardHeader>
                            <CardTitle>Ownership History Timeline</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {history.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">No transfer history</div>
                            ) : (
                                <div className="space-y-4">
                                    {history.map((transfer, index) => (
                                        <div key={transfer.id} className="relative pl-8 pb-4 last:pb-0">
                                            {index < history.length - 1 && (
                                                <div className="absolute left-[11px] top-6 bottom-0 w-px bg-[#1F293D]"></div>
                                            )}
                                            <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-[#1E5FA8] border-2 border-[#060D1A] flex items-center justify-center">
                                                <span className="material-symbols-outlined text-[12px] text-white">
                                                    {isApproved(transfer.status) ? 'check' : transfer.status === 'REJECTED' ? 'close' : 'pending'}
                                                </span>
                                            </div>
                                            <div className="bg-[#0D1F38] border border-[#1F293D] rounded p-3">
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-bold text-white">
                                                            {transfer.fromUser?.displayName || 'Unknown'} → {transfer.toUser?.displayName || 'Unknown'}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                                            {new Date(transfer.createdAt).toLocaleString('en-IN')}
                                                        </div>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${isApproved(transfer.status) ? 'bg-emerald-900/50 text-emerald-400' :
                                                            transfer.status === 'REJECTED' ? 'bg-red-900/50 text-red-400' :
                                                                'bg-amber-900/50 text-amber-400'
                                                        }`}>
                                                        {transfer.status}
                                                    </span>
                                                </div>
                                                {transfer.reason && (
                                                    <div className="text-xs text-slate-400 italic">"{transfer.reason}"</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card goldAccent={false}>
                        <CardHeader><CardTitle>Quick Info</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <InfoBlock label="Asset ID" value={<span className="font-mono text-xs break-all">{asset.id}</span>} />
                            <InfoBlock label="Owner Wallet" value={<span className="font-mono text-xs break-all">{asset.owner?.walletAddress}</span>} />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

// Helper Components
function InfoBlock({ label, value }) {
    return (
        <div className="p-3 rounded bg-[#0D1F38] border border-[#1F293D]">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
            <div className="text-white text-sm font-bold">{value}</div>
        </div>
    );
}

function AssetDetailSkeleton() {
    return (
        <div className="p-6 space-y-6 animate-pulse">
            <div className="h-8 bg-[#1F293D] rounded w-1/3"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="h-64 bg-[#1F293D] rounded"></div>
                    <div className="h-96 bg-[#1F293D] rounded"></div>
                </div>
                <div className="space-y-4">
                    <div className="h-48 bg-[#1F293D] rounded"></div>
                </div>
            </div>
        </div>
    );
}