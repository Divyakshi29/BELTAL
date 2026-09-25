import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { adminApi } from '../../services/api';
import { useTransaction } from '../../context/TransactionContext';
import useModalA11y from '../../hooks/useModalA11y';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { RoleBadge, ClearanceBadge } from '../../components/ui/Badge';
import { gradeLabel, GRADE_OPTIONS } from '../../config/grades';

// The reinstate-then-retry repair path can chain up to 5 sequential Sepolia
// confirmations (register + grant, then updateClearance + grant + revoke-old)
// across its two calls — the default 90s per-call budget assumes at most 2-3.
const REPAIR_TIMEOUT = 180_000;

export default function IdentityTable({ refreshTrigger = 0, onRegisterClick }) {
  const { showError, showSuccess, showPending, removeToast } = useTransaction();
  const [identities, setIdentities] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sbuFilter, setSbuFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20 });
  const [editModal, setEditModal] = useState({ open: false, identity: null });
  const [saving, setSaving] = useState(false);

  // The "Reports To" dropdown needs a broad candidate pool, independent of
  // whatever page/search/filter the table itself is showing.
  const [managerCandidates, setManagerCandidates] = useState([]);

  const fetchIdentities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listIdentities({
        search: search || undefined,
        sbu: sbuFilter || undefined,
        clearance: tierFilter || undefined,
        page: pagination.page,
        limit: pagination.limit,
      });
      setIdentities(data.users || []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("Failed to fetch identities", err);
      setError(err.uiMessage || 'The identity registry could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [search, sbuFilter, tierFilter, pagination.page, pagination.limit]);

  const fetchManagerCandidates = useCallback(async () => {
    try {
      const data = await adminApi.listIdentities({ limit: 100, status: 'ACTIVE' });
      setManagerCandidates(data.users || []);
    } catch (err) {
      console.error("Failed to fetch manager candidates", err);
    }
  }, []);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities, refreshTrigger]);

  useEffect(() => {
    fetchManagerCandidates();
  }, [fetchManagerCandidates, refreshTrigger]);

  const updateSearch = (value) => {
    setSearch(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const updateSbuFilter = (value) => {
    setSbuFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const updateTierFilter = (value) => {
    setTierFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

  const closeEditModal = useCallback(() => setEditModal({ open: false, identity: null }), []);

  const handleEditSave = async () => {
    if (!editModal.identity) return;
    setSaving(true);
    try {
      const rolePayload = {
        role: editModal.identity.role,
        clearanceLevel: editModal.identity.clearanceLevel,
      };
      let result = await adminApi.updateRole(editModal.identity.id, rolePayload);

      // This specific warning means the identity was never actually
      // confirmed on-chain (DB row exists, IdentityRegistry doesn't). No
      // amount of retrying this same call fixes that — but reinstateIdentity's
      // re-register-on-chain primitive does, safely (a no-op if the identity
      // turns out to already be active). Self-heal once, automatically.
      const needsRepair = /never fully registered on-chain/i.test(result?.chain?.warning || '');
      if (needsRepair) {
        // The repair (re-register) plus the retried update can chain up to 5
        // sequential Sepolia confirmations between them — give this path real
        // headroom and tell the admin it'll take longer than usual.
        const pendingId = showPending('Repairing on-chain registration, then re-applying the update — this can take a minute or two...');
        try {
          await adminApi.reinstateIdentity(editModal.identity.id, { timeout: REPAIR_TIMEOUT });
          result = await adminApi.updateRole(editModal.identity.id, rolePayload, { timeout: REPAIR_TIMEOUT });
        } finally {
          removeToast(pendingId);
        }
      }

      await adminApi.updateOrgAssignment(editModal.identity.id, {
        managerId: editModal.identity.managerId || null,
        seniorityGrade: editModal.identity.seniorityGrade || null,
      });

      if (result?.chain?.warning) {
        showError(result.chain.warning);
      } else if (needsRepair) {
        showSuccess("This identity was re-registered on-chain to fix a stale record, then updated.");
      }

      closeEditModal();
      fetchIdentities();
      fetchManagerCandidates();
    } catch (err) {
      showError("Failed to update: " + (err.uiMessage || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-white border-slate-200 shadow-sm">
      <CardHeader className="bg-white border-b border-slate-200">
        <div className="flex items-center justify-between w-full">
          <div>
            <CardTitle className="text-[#0A1F3D] font-black text-base uppercase tracking-wider">
              Sovereign Identity Registry
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              {total} identit{total === 1 ? 'y' : 'ies'} provisioned
            </p>
          </div>
          <button
            type="button"
            onClick={onRegisterClick}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1E5FA8] hover:bg-[#164a85] px-4 py-2 text-xs font-bold text-white shadow-md transition-all shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">person_add</span>
            Register Identity
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {/* Search & Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
          <input
            type="text"
            aria-label="Search identities by name or wallet address"
            placeholder="Search wallet address or DID..."
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1F3D] placeholder-slate-400 focus:border-[#1E5FA8] outline-none"
          />
          <select
            aria-label="Filter by SBU"
            value={sbuFilter}
            onChange={(e) => updateSbuFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1F3D] focus:border-[#1E5FA8] outline-none"
          >
            <option value="">All SBUs</option>
            <option value="SBU_RADAR">Radar</option>
            <option value="SBU_EW">Electronic Warfare</option>
            <option value="SBU_MILCOMM">Military Comm</option>
            <option value="SBU_CYBER">Cyber Security</option>
          </select>
          <select
            aria-label="Filter by clearance tier"
            value={tierFilter}
            onChange={(e) => updateTierFilter(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-[#0A1F3D] focus:border-[#1E5FA8] outline-none"
          >
            <option value="">All Tiers</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
            <option value="4">Tier 4</option>
          </select>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
            <p className="font-bold">Unable to load identities</p>
            <p className="mt-0.5">{error}</p>
            <button type="button" onClick={fetchIdentities} className="mt-2 font-bold underline">Retry</button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <p className="text-slate-500 text-center py-6 text-xs">Loading identities...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 font-bold">Wallet Address</th>
                  <th className="px-3 py-2 font-bold">Role</th>
                  <th className="px-3 py-2 font-bold">Clearance</th>
                  <th className="px-3 py-2 font-bold">SBU</th>
                  <th className="px-3 py-2 font-bold">Grade</th>
                  <th className="px-3 py-2 font-bold">Reports To</th>
                  <th className="px-3 py-2 font-bold">Registry Status</th>
                  <th className="px-3 py-2 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {identities.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-3 py-6 text-center text-slate-400">
                      No identities found
                    </td>
                  </tr>
                ) : (
                  identities.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 py-2">
                        <div className="font-mono text-[#0A1F3D] font-bold">
                          {user.walletAddress?.slice(0, 6)}...{user.walletAddress?.slice(-4)}
                        </div>
                        <div className="text-[10px] text-slate-400">{user.displayName || 'Unknown'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-3 py-2">
                        <ClearanceBadge level={user.clearanceLevel} />
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {user.sbu?.replace('SBU_', '') || 'N/A'}
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {gradeLabel(user.seniorityGrade)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {user.manager?.displayName || <span className="text-slate-400">— none —</span>}
                      </td>
                      <td className="px-3 py-2">
                        {user.revokedAt ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600" title={user.revocationReason || undefined}>
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            REVOKED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            REGISTERED
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {user.revokedAt ? (
                          <Link
                            to="/admin/quarantine"
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-red-300 text-red-600 hover:bg-red-50 rounded text-[11px] font-bold transition-colors"
                          >
                            <span className="material-symbols-outlined text-[13px]" aria-hidden="true">gpp_bad</span>
                            Quarantined
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditModal({ open: true, identity: { ...user } })}
                            aria-label={`Edit identity for ${user.displayName || user.walletAddress}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-[#1E5FA8] text-[#1E5FA8] hover:bg-[#1E5FA8] hover:text-white rounded text-[11px] font-bold transition-colors"
                          >
                            <span className="material-symbols-outlined text-[13px]" aria-hidden="true">edit</span>
                            Edit Identity
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200">
            <div className="text-[11px] text-slate-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, total)} of {total}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page === 1}
                className="px-3 py-1.5 bg-[#1E5FA8] hover:bg-[#164a85] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-bold rounded-lg transition-colors"
              >
                Previous
              </button>
              <span className="px-2 text-[11px] text-slate-500">
                Page {pagination.page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPagination((prev) => ({ ...prev, page: Math.min(totalPages, prev.page + 1) }))}
                disabled={pagination.page >= totalPages}
                className="px-3 py-1.5 bg-[#1E5FA8] hover:bg-[#164a85] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-bold rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Edit Identity Modal - Portal Mount */}
      {editModal.open && (
        <EditRoleDialog
          identity={editModal.identity}
          candidateManagers={managerCandidates.filter((u) => u.id !== editModal.identity?.id)}
          saving={saving}
          onChange={(changes) => setEditModal(prev => ({ ...prev, identity: { ...prev.identity, ...changes } }))}
          onSave={handleEditSave}
          onClose={closeEditModal}
        />
      )}
    </Card>
  );
}

function EditRoleDialog({ identity, candidateManagers, saving, onChange, onSave, onClose }) {
  const dialogRef = useModalA11y(onClose);

  // Lock page scrolling while the dialog is mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-role-title"
        className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#D4AF37] text-xl" aria-hidden="true">admin_panel_settings</span>
            <h2 id="edit-role-title" className="text-sm font-black text-[#0A1F3D]">Modify Identity</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 text-slate-800 overflow-y-auto">
          <div className="p-2.5 rounded-lg bg-[#0A1F3D] border border-[#1F293D]">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#D4AF37] text-xl" aria-hidden="true">badge</span>
              <div>
                <div className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-wider">Target Identity</div>
                <div className="text-xs text-white font-mono font-bold">
                  {identity?.walletAddress?.slice(0, 8)}...{identity?.walletAddress?.slice(-4)}
                </div>
                <div className="text-[10px] text-slate-300">— {identity?.displayName || 'System Administrator'}</div>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="edit-role" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Role</label>
            <select
              id="edit-role"
              value={identity?.role || ''}
              onChange={(e) => onChange({ role: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
            >
              <option value="USER">USER</option>
              <option value="MANAGER">MANAGER</option>
              <option value="AUDITOR">AUDITOR</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>

          <div>
            <label htmlFor="edit-clearance" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Clearance Tier</label>
            <select
              id="edit-clearance"
              value={identity?.clearanceLevel || 1}
              onChange={(e) => onChange({ clearanceLevel: parseInt(e.target.value, 10) })}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
            >
              <option value={1}>Tier 1 — Basic</option>
              <option value={2}>Tier 2 — Confidential</option>
              <option value={3}>Tier 3 — Secret</option>
              <option value={4}>Tier 4 — Top Secret</option>
            </select>
          </div>

          {/* Org-structure layer: who this identity reports to, and their
              grade. Independent of role/clearance above — see schema.prisma
              for why these are kept separate from RBAC and classification. */}
          <div>
            <label htmlFor="edit-grade" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Grade</label>
            <select
              id="edit-grade"
              value={identity?.seniorityGrade || ''}
              onChange={(e) => onChange({ seniorityGrade: e.target.value ? parseInt(e.target.value, 10) : null })}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
            >
              <option value="">Not set</option>
              {GRADE_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-manager" className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Reports To</label>
            <select
              id="edit-manager"
              value={identity?.managerId || ''}
              onChange={(e) => onChange({ managerId: e.target.value || null })}
              className="w-full bg-slate-50 border border-slate-300 rounded-md px-3 py-2 text-xs text-slate-900 focus:border-[#1E5FA8] outline-none"
            >
              <option value="">No manager assigned</option>
              {candidateManagers?.map((m) => (
                <option key={m.id} value={m.id}>{m.displayName || m.walletAddress} — {gradeLabel(m.seniorityGrade)}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">A manager's grade must be at or above this identity's grade.</p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex gap-2 p-3.5 border-t border-slate-200 shrink-0 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-md font-bold text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 px-3 py-2 bg-[#1E5FA8] hover:bg-[#164a85] disabled:bg-slate-300 text-white font-bold rounded-md text-xs transition-colors shadow-sm"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
