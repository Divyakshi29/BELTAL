import { useState, useEffect, useCallback } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import IdentityTable from '../../components/admin/IdentityTable';
import CreateIdentityModal from '../../components/admin/CreateIdentityModal';
import MintAssetModal from '../../components/admin/MintAssetModal';
import { adminApi } from '../../services/api';

function StatValue({ value, loading }) {
  if (loading) {
    return <div className="h-9 w-24 rounded-lg bg-slate-200 animate-pulse mt-1" />;
  }
  return (
    <p className="text-[32px] font-black text-slate-900 leading-none mt-1 tabular-nums">
      {value ?? '—'}
    </p>
  );
}

function ConsensusHealth({ status, loading }) {
  if (loading) {
    return <div className="h-9 w-28 rounded-lg bg-slate-200 animate-pulse mt-1" />;
  }
  const isNominal = status === 'NOMINAL';
  return (
    <div className="flex items-center gap-2 mt-1">
      <span
        className={`w-3 h-3 rounded-full shrink-0 ${isNominal ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-500'}`}
      />
      <span
        className={`text-[28px] font-black leading-none tabular-nums ${isNominal ? 'text-emerald-600' : 'text-red-600'}`}
      >
        {status ?? '—'}
      </span>
    </div>
  );
}

function buildStats(data, loading) {
  return [
    {
      id: 'stat-identities',
      icon: 'fingerprint',
      label: 'Total Identities Provisioned',
      value: <StatValue value={data?.totalIdentities?.toLocaleString()} loading={loading} />,
      sub: 'Sovereign identity records',
    },
    {
      id: 'stat-assets',
      icon: 'token',
      label: 'Active Defence Assets',
      value: <StatValue value={data?.activeAssets?.toLocaleString()} loading={loading} />,
      sub: 'Assets tracked on-chain',
    },
    {
      id: 'stat-pending',
      icon: 'pending_actions',
      label: 'Pending Approvals / Transfers',
      value: <StatValue value={data?.pendingTransfers?.toLocaleString()} loading={loading} />,
      sub: 'Awaiting consensus approval',
    },
    {
      id: 'stat-consensus',
      icon: 'hub',
      label: 'Node Consensus Health',
      value: <ConsensusHealth status={data?.consensusHealth} loading={loading} />,
      sub: 'Sovereign node network status',
    },
  ];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [mintOpen, setMintOpen] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  const statCards = buildStats(stats, statsLoading);

  return (
    <div className="role-console min-h-full p-6 sm:p-8 bg-slate-100/60">
      {/* Page header banner */}
      <div className="mb-7 bg-[#0A1F3D] p-6 rounded-xl border border-[#1F293D] shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px flex-1 bg-gradient-to-r from-[#D4AF37]/60 to-transparent" />
          <span className="text-[9px] font-black tracking-[0.22em] text-[#D4AF37] uppercase">
            ◈ RESTRICTED — ADMIN CLEARANCE
          </span>
          <span className="h-px flex-1 bg-gradient-to-l from-[#D4AF37]/60 to-transparent" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-black text-white tracking-wide leading-tight">
              Sovereign Administration
            </h1>
            <p className="text-[13px] text-slate-100 mt-1 font-medium">
              Identity provisioning, ledger management, and node oversight.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Metric Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <Card key={card.id} goldAccent hoverable id={card.id} className="dashboard-card bg-white border-slate-200">
            <CardHeader>
              <CardTitle className="text-slate-900">{card.label}</CardTitle>
              <span
                className="material-symbols-outlined text-[20px] text-[#D4AF37] shrink-0"
                style={{ fontVariationSettings: '"FILL" 1' }}
              >
                {card.icon}
              </span>
            </CardHeader>
            <CardContent>
              {card.value}
              <p className="text-[11px] text-slate-500 mt-2">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Identity Ledger Section */}
      <div className="relative">
        <div className="flex items-center gap-3 mb-5">
          <span
            className="material-symbols-outlined text-[18px] text-[#D4AF37]"
            style={{ fontVariationSettings: '"FILL" 1' }}
          >
            manage_accounts
          </span>
          <h2 className="text-[11px] font-black tracking-[0.2em] uppercase text-slate-700">
            Identity Management
          </h2>
          <span className="flex-1 h-px bg-slate-200" />
        </div>

        <IdentityTable
          refreshTrigger={refreshTick}
          onRegisterClick={() => setCreateOpen(true)}
        />

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => setMintOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1E5FA8] px-4 py-2.5 text-[12px] font-bold text-white shadow-lg transition-all hover:bg-[#174d8a]"
          >
            <span className="material-symbols-outlined text-[17px]">token</span>
            Mint Defence Asset
          </button>
        </div>
      </div>

      {/* Modals */}
      <CreateIdentityModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setRefreshTick((t) => t + 1);
          fetchStats();
        }}
      />
      <MintAssetModal open={mintOpen} onClose={() => setMintOpen(false)} onSuccess={fetchStats} />
    </div>
  );
}