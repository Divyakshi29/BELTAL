import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { assetApi } from '../../services/api';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { TierBadge } from '../../components/ui/Badge';

export default function TeamAssets() {
    const { user } = useAuth();
    const sbu = user?.sbu;
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(Boolean(sbu));
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // ?holder=<userId> arrives from the Team Members roster, so "view this
    // person's equipment" lands on a real, already-scoped list instead of a
    // per-member page the API has no endpoint for.
    const [searchParams, setSearchParams] = useSearchParams();
    const holderId = searchParams.get('holder');

    // Debounce the search so typing does not fire a request per keystroke.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchTeamAssets = useCallback(async () => {
        if (!sbu) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await assetApi.list({
                sbu,
                ...(debouncedSearch ? { search: debouncedSearch } : {}),
                limit: 100
            });
            const list = Array.isArray(data) ? data : [];
            setAssets(holderId ? list.filter((a) => a.owner?.id === holderId) : list);
        } catch (err) {
            console.error("Failed to fetch team assets", err);
            setError(err.uiMessage || 'Team assets could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [sbu, debouncedSearch, holderId]);

    useEffect(() => {
        fetchTeamAssets();
    }, [fetchTeamAssets]);

    return (
        <div className="role-console min-h-full p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="h-px w-12 bg-gradient-to-r from-[#1E5FA8]/40 to-transparent" />
                        <span className="text-[9px] font-black tracking-[0.22em] text-[#1E5FA8]/60 uppercase">
                            OFFICER CLEARANCE — {user?.sbu?.replace('SBU_', '')}
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-wide">Team Assets</h1>
                    {holderId && (
                        <button
                            type="button"
                            onClick={() => setSearchParams({})}
                            className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#1E5FA8] bg-[#1E5FA8]/10 px-3 py-1 text-[11px] font-bold text-[#1E5FA8]"
                        >
                            Filtered to one custodian
                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">close</span>
                        </button>
                    )}
                </div>
            </div>

            <Card goldAccent={false}>
                <CardHeader>
                    <CardTitle>Team Asset Ledger</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Search Bar */}
                    <div className="mb-4">
                        <input
                            type="text"
                            aria-label="Search team assets"
                            placeholder="Search by asset name or token ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-[#1E5FA8] outline-none"
                        />
                    </div>

                    {error && (
                        <div className="mb-4 rounded-lg border border-red-500/40 p-4 text-sm text-red-400" role="alert">
                            <p className="font-bold">Unable to load team assets</p>
                            <p className="mt-1 text-xs">{error}</p>
                            <button type="button" onClick={fetchTeamAssets} className="mt-3 text-xs font-bold underline">Retry</button>
                        </div>
                    )}

                    {/* Table */}
                    {loading ? (
                        <p className="text-slate-400 text-center py-8">Loading team assets...</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-300">
                                <thead className="text-xs uppercase text-[#1E5FA8] border-b border-[#1F293D]">
                                    <tr>
                                        <th className="px-4 py-3">Asset Name</th>
                                        <th className="px-4 py-3">Classification</th>
                                        <th className="px-4 py-3">Current Holder</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1F293D]">
                                    {assets.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                                                No team assets found
                                            </td>
                                        </tr>
                                    ) : (
                                        assets.map((asset) => (
                                            <tr key={asset.id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-4 py-3 font-medium text-white">
                                                    {asset.name}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <TierBadge tier={asset.classificationTier} />
                                                </td>
                                                <td className="px-4 py-3 text-xs">
                                                    {asset.owner?.displayName || 'Unassigned'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold leading-none text-emerald-800">
                                                        {asset.status || 'ACTIVE'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <Link
                                                        to={`/assets/${asset.id}`}
                                                        aria-label={`View details for ${asset.name}`}
                                                        className="group inline-flex items-center gap-1 rounded-lg border border-[#1E5FA8] px-3 py-1.5 text-[11px] font-bold text-[#1E5FA8] hover:bg-[#1E5FA8] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E5FA8] transition-colors"
                                                    >
                                                        View details
                                                        <span
                                                            className="material-symbols-outlined text-[15px] transition-transform group-hover:translate-x-0.5"
                                                            aria-hidden="true"
                                                        >
                                                            arrow_forward
                                                        </span>
                                                    </Link>
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
