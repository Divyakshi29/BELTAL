import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useTeamMembers from '../../hooks/useTeamMembers';
import { RoleBadge, ClearanceBadge } from '../../components/ui/Badge';
import { gradeLabel } from '../../config/grades';

const shortWallet = (address = '') => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);

const PAGE_SIZE = 15;

export default function TeamMembers() {
    const { user } = useAuth();
    const { members, loading, error, reload } = useTeamMembers(user?.sbu);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const query = search.trim().toLowerCase();
    const filteredMembers = query
        ? members.filter((member) =>
            (member.displayName || '').toLowerCase().includes(query) ||
            (member.walletAddress || '').toLowerCase().includes(query))
        : members;

    // The API caps this list at 100 rows and has no server-side page/total
    // support (not worth adding for an SBU roster this small), so pagination
    // here just slices the already-fetched, already-filtered array.
    const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const visibleMembers = filteredMembers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const handleSearchChange = (value) => {
        setSearch(value);
        setPage(1);
    };

    return (
        <div className="min-h-full p-6 sm:p-8 space-y-6 bg-slate-100/60">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="h-px w-12 bg-gradient-to-r from-[#1E5FA8]/60 to-transparent" />
                    <span className="text-[10px] font-black tracking-[0.22em] text-[#1E5FA8] uppercase">
                        OFFICER CLEARANCE — {user?.sbu?.replace('SBU_', '')}
                    </span>
                </div>
                <h1 className="text-2xl font-black text-[#0A1F3D] tracking-wide">Team Members</h1>
                <p className="text-sm text-slate-600 mt-1">Personnel registered in your business unit.</p>
            </div>

            <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
                    <h2 className="text-base font-black uppercase tracking-wider text-[#0A1F3D]">Team Personnel Registry</h2>
                    {!loading && !error && (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                            {filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'}
                        </span>
                    )}
                </div>

                <div className="p-4 space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <span
                            className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400"
                            aria-hidden="true"
                        >
                            search
                        </span>
                        <input
                            type="text"
                            aria-label="Search team members"
                            placeholder="Search by name or wallet…"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-[#0A1F3D] placeholder-slate-400 focus:border-[#1E5FA8] focus:ring-1 focus:ring-[#1E5FA8] outline-none"
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
                            <p className="font-bold">Unable to load team members</p>
                            <p className="mt-0.5">{error}</p>
                            <button type="button" onClick={reload} className="mt-2 font-bold underline">Retry</button>
                        </div>
                    )}

                    {!error && (
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full min-w-[640px] text-left text-sm">
                                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 font-bold">Name</th>
                                        <th className="px-4 py-3 font-bold">DID / Wallet</th>
                                        <th className="px-4 py-3 font-bold">Role</th>
                                        <th className="px-4 py-3 font-bold">Clearance</th>
                                        <th className="px-4 py-3 font-bold">Grade / Reports To</th>
                                        <th className="px-4 py-3 font-bold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        Array.from({ length: 4 }).map((_, i) => (
                                            <tr key={i}>
                                                {Array.from({ length: 6 }).map((__, j) => (
                                                    <td key={j} className="px-4 py-4">
                                                        <div className="h-3 w-3/4 rounded bg-slate-200 animate-pulse" />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))
                                    ) : visibleMembers.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-12 text-center">
                                                <span className="material-symbols-outlined block text-[36px] text-slate-300 mb-2" aria-hidden="true">
                                                    groups
                                                </span>
                                                <p className="text-sm font-bold text-slate-600">
                                                    {query ? 'No members match your search' : 'No team members found'}
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        visibleMembers.map((member) => (
                                            <tr key={member.id} className="hover:bg-slate-50/80 transition-colors">
                                                <td className="px-4 py-3 font-bold text-[#0A1F3D]">
                                                    {member.displayName || 'Unknown'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-mono text-xs text-slate-600" title={member.walletAddress}>
                                                        {shortWallet(member.walletAddress)}
                                                    </div>
                                                    {member.did && (
                                                        <div className="text-[10px] text-slate-400">{member.did}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <RoleBadge role={member.role} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <ClearanceBadge level={member.clearanceLevel} />
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-600">
                                                    <div>{gradeLabel(member.seniorityGrade)}</div>
                                                    <div className="text-slate-400">
                                                        {member.manager?.displayName ? `→ ${member.manager.displayName}` : 'No manager assigned'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <Link
                                                        to={`/team-assets?holder=${member.id}`}
                                                        aria-label={`View assets held by ${member.displayName || 'team member'}`}
                                                        className="group inline-flex items-center gap-1 rounded-lg border border-[#1E5FA8] px-3 py-1.5 text-[11px] font-bold text-[#1E5FA8] hover:bg-[#1E5FA8] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E5FA8] transition-colors"
                                                    >
                                                        View assets
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

                    {!loading && !error && totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                            <div className="text-xs text-slate-500">
                                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredMembers.length)} of {filteredMembers.length}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 bg-[#1E5FA8] hover:bg-[#164a85] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors"
                                >
                                    Previous
                                </button>
                                <span className="px-3 py-1.5 text-xs text-slate-500">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 bg-[#1E5FA8] hover:bg-[#164a85] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
