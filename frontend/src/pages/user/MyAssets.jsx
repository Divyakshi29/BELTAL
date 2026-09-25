import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { assetApi } from '../../services/api';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { TierBadge, CustodyBadge } from '../../components/ui/Badge';

export default function MyAssets() {
    const [allAssets, setAllAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');

    const fetchAssets = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await assetApi.listMine();
            setAllAssets(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Failed to fetch assets", err);
            setError(err.uiMessage || 'Your assets could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);

    // The custody list is already scoped to the caller, so search runs locally.
    const query = search.trim().toLowerCase();
    const assets = query
        ? allAssets.filter((asset) =>
            (asset.name || '').toLowerCase().includes(query) ||
            (asset.tokenId || '').toLowerCase().includes(query))
        : allAssets;

    return (
        <div className="user-console min-h-full p-6 sm:p-8 space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="h-px w-12 bg-gradient-to-r from-emerald-500/40 to-transparent" />
                    <span className="text-[9px] font-black tracking-[0.22em] text-emerald-500/60 uppercase">
                        REGISTERED PERSONNEL — MY ASSETS
                    </span>
                </div>
                <h1 className="text-2xl font-black text-white tracking-wide">My Assets</h1>
                <p className="text-sm text-slate-400 mt-1">
                    View and manage all assets under your custody
                </p>
            </div>

            {/* Search */}
            <Card goldAccent={false}>
                <CardContent>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]" aria-hidden="true">
                            search
                        </span>
                        <input
                            type="text"
                            aria-label="Search my assets"
                            placeholder="Search by asset name or token ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[#0D1F38] border border-[#1F293D] rounded pl-10 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none"
                        />
                    </div>
                </CardContent>
            </Card>

            {error && (
                <div className="rounded-lg border border-red-500/40 p-4 text-sm text-red-400" role="alert">
                    <p className="font-bold">Unable to load your assets</p>
                    <p className="mt-1 text-xs">{error}</p>
                    <button type="button" onClick={fetchAssets} className="mt-3 text-xs font-bold underline">Retry</button>
                </div>
            )}

            {/* Assets Grid */}
            {loading ? (
                <div className="text-center py-12">
                    <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-400 mt-3 text-sm">Loading your assets...</p>
                </div>
            ) : assets.length === 0 ? (
                <Card goldAccent={false}>
                    <CardContent>
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-6xl text-slate-600 mb-3">
                                inventory_2
                            </span>
                            <p className="text-slate-400 text-sm">{query ? 'No assets match your search' : "You don't have any assets yet"}</p>
                            <p className="text-slate-500 text-xs mt-1">{query ? 'Try a different name or token ID' : 'Assets will appear here once assigned to you'}</p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assets.map((asset) => {
                        return (
                        <Link
                            key={asset.id}
                            to={`/assets/${asset.id}`}
                            className="group"
                        >
                            <Card goldAccent={false} className="h-full hover:border-emerald-500/50 transition-all">
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <CardTitle className="text-sm font-bold text-white truncate">
                                                {asset.name}
                                            </CardTitle>
                                            <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                                                ID: {asset.id?.slice(0, 8)}...
                                            </div>
                                        </div>
                                        <CustodyBadge pending={Boolean(asset.pendingTransfer)} className="shrink-0" />
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-500">SBU</span>
                                            <span className="text-white font-medium">{asset.sbu?.replace('SBU_', '') || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-500">Classification</span>
                                            <TierBadge tier={asset.classificationTier} />
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-500">Minted On</span>
                                            <span className="text-slate-300">
                                                {new Date(asset.createdAt).toLocaleDateString('en-IN')}
                                            </span>
                                        </div>
                                        {asset.pendingTransfer && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-slate-500">Pending to</span>
                                                <span className="text-amber-700 font-medium truncate ml-2">
                                                    {asset.pendingTransfer.toUser?.displayName || 'Unknown'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-[#1F293D] flex items-center justify-between">
                                        <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                                            View Details
                                        </span>
                                        <span className="material-symbols-outlined text-emerald-700 text-[18px] group-hover:translate-x-1 transition-transform">
                                            arrow_forward
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                        );
                    })}
                </div>
            )}

            {/* Summary */}
            {!loading && assets.length > 0 && (
                <div className="text-center text-xs text-slate-500">
                    Showing {assets.length} asset{assets.length !== 1 ? 's' : ''}
                </div>
            )}
        </div>
    );
}
