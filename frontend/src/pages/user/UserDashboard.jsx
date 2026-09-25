import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { assetApi, transferApi } from '../../services/api';
import useBlockNumber from '../../hooks/useBlockNumber';

const shortAddress = (value) => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : 'Credential pending';

/** Compact "how long ago" label for the last-activity tile. */
function formatRelative(date) {
  if (!date) return 'None';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : date.toLocaleDateString();
}

const TRANSFER_STATUS_STYLE = {
  PENDING: 'bg-amber-400/15 text-amber-300',
  APPROVED: 'bg-sky-400/15 text-sky-300',
  EXECUTED: 'bg-emerald-400/15 text-emerald-300',
  REJECTED: 'bg-red-400/15 text-red-300',
};

function Empty({ icon, title, text }) {
  return <div className="px-6 py-14 text-center"><span className="material-symbols-outlined text-4xl text-[#7AB0FE]">{icon}</span><p className="mt-3 text-sm font-bold text-[#0D2B4E]">{title}</p><p className="mx-auto mt-1 max-w-sm text-sm text-[#65758A]">{text}</p></div>;
}

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myAssets, setMyAssets] = useState([]);
  const [myTransfers, setMyTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assetsError, setAssetsError] = useState(false);
  const blockNumber = useBlockNumber();

  useEffect(() => {
    if (!user?.walletAddress) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true); setAssetsError(false);
      // Both lists are scoped to the signed-in user by the API.
      const [assetsResult, transfersResult] = await Promise.allSettled([
        assetApi.listMine(),
        // Every request this user is a party to, newest first: the pending
        // count and the last-activity timestamp both come off this one list.
        transferApi.list({ limit: 100 }),
      ]);
      if (cancelled) return;
      setAssetsError(assetsResult.status === 'rejected');
      setMyAssets(assetsResult.status === 'fulfilled' ? assetsResult.value : []);
      setMyTransfers(transfersResult.status === 'fulfilled' ? transfersResult.value : []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user?.walletAddress]);

  const pendingTransfers = myTransfers.filter((t) => t.status === 'PENDING');

  // Last activity is derived from what the user can already see — the most
  // recent timestamp across their assets and their transfer requests. Plain
  // users have no access to /api/audit*, so there is no event feed to read.
  const lastActivityAt = [
    ...myAssets.map((a) => a.updatedAt || a.createdAt),
    ...myTransfers.map((t) => t.updatedAt || t.createdAt),
  ]
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b - a)[0];

  const metrics = [
    { icon: 'fingerprint', label: 'Identity credential', value: `Level ${user?.clearanceLevel ?? '—'}`, detail: user?.role ? `${user.role} · verified access profile` : 'Verified access profile', cls: 'bg-[#C8A74C]/15 text-[#9A730C]' },
    { icon: 'history', label: 'Last activity', value: loading ? '—' : formatRelative(lastActivityAt), detail: lastActivityAt ? lastActivityAt.toLocaleString() : 'No recorded activity yet', cls: 'bg-[#0D2B4E]/10 text-[#0D2B4E]' },
    { icon: 'token', label: 'Assets in custody', value: loading ? '—' : assetsError ? 'Unavailable' : String(myAssets.length).padStart(2, '0'), detail: assetsError ? 'Could not load your registry' : 'Registered to your identity', cls: 'bg-[#1E5FA8]/10 text-[#1E5FA8]' },
    { icon: 'pending_actions', label: 'Open requests', value: loading ? '—' : String(pendingTransfers.length).padStart(2, '0'), detail: 'Transfers awaiting review', cls: 'bg-emerald-100 text-emerald-700' },
  ];

  return <div className="dashboard-console min-h-full bg-[#F6F8FC] text-[#001631]">
    <section className="bg-[#F4F8FC] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-7xl rounded-xl border border-[#315C89] bg-[linear-gradient(135deg,#0A2748_0%,#123D67_62%,#17577E_100%)] p-6 shadow-[0_14px_32px_rgba(13,43,78,0.18)] sm:p-8 lg:p-9">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_310px]"><div><div className="mb-5 inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] text-white"><span className="h-2 w-2 rounded-full bg-[#E8CC71]" /> BELTAL USER PORTAL</div><p className="mb-2 text-sm font-semibold text-[#C5DDF7]">Secure personnel access</p><h1 className="max-w-3xl text-3xl font-black tracking-[-0.025em] text-white sm:text-4xl">Welcome, <span className="text-[#E8CC71]">{user?.displayName || user?.name || 'Officer'}</span>.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[#D7E9FB]">Access your identity record, asset registry, and transfer requests through the BELTAL sovereign ledger.</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={() => navigate('/my-assets')} className="dashboard-primary-action rounded-md bg-white px-5 py-3 text-sm font-bold text-[#0D2B4E] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#E8F1FB]">View my assets <span aria-hidden="true">→</span></button><button onClick={() => navigate('/transfer/request')} className="rounded-md border border-white/35 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/20">Request transfer</button></div></div><div className="overflow-hidden rounded-xl border border-white/20 bg-white/10 p-4 shadow-[0_12px_30px_rgba(0,18,49,0.18)] backdrop-blur-xl"><div className="flex items-center justify-between border-b border-white/15 pb-3"><span className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-white"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" /> LEDGER ONLINE</span><span className="font-mono text-[10px] text-[#C5DDF7]">{blockNumber === null ? 'RPC offline' : `#${blockNumber.toLocaleString()}`}</span></div><div className="mt-3 space-y-2">{[['verified_user','Identity verified'],['token','Registry synchronized'],['policy','Access policy active']].map(([icon, text]) => <div key={text} className="flex items-center gap-3 rounded-md border border-white/10 bg-[#071D39]/20 px-3 py-2"><span className="material-symbols-outlined text-[17px] text-[#9DCAFF]">{icon}</span><span className="flex-1 text-xs font-semibold text-white">{text}</span><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /></div>)}</div></div></div>
      </div>
    </section>

    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-12"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ icon, label, value, detail, cls }) => <article key={label} className="group rounded-2xl border border-[#D7E0EA] bg-[#FFFDF8] p-5 shadow-[0_5px_18px_rgba(13,43,78,0.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(13,43,78,0.12)]"><div className="flex items-start justify-between"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${cls}`}><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span></div><span className="text-[10px] font-bold tracking-[0.12em] text-[#7A8796]">SECURED</span></div><p className="mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-[#52657B]">{label}</p><p className="mt-1 text-2xl font-extrabold tracking-tight text-[#0D2B4E]">{value}</p><p className="mt-1 text-sm text-[#65758A]">{detail}</p></article>)}</div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.65fr_0.85fr]"><section className="overflow-hidden rounded-2xl border border-[#D7E0EA] bg-[#FFFDF8] shadow-[0_5px_18px_rgba(13,43,78,0.07)]"><div className="flex items-center justify-between border-b border-[#D7E0EA] px-6 py-5"><div><p className="text-[11px] font-bold tracking-[0.13em] text-[#1E5FA8]">ASSET REGISTRY</p><h2 className="mt-1 text-xl font-bold text-[#0D2B4E]">Assets under your custody</h2></div><button onClick={() => navigate('/my-assets')} className="rounded-lg bg-[#0D2B4E] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#1E5FA8]">View all →</button></div>
        {loading ? <div className="p-12 text-center text-sm text-[#65758A]"><span className="mx-auto mb-3 block h-7 w-7 animate-spin rounded-full border-2 border-[#1E5FA8] border-t-transparent" />Syncing your registry…</div> : assetsError ? <Empty icon="lock" title="Registry unavailable" text="Your assets could not be loaded. Try again shortly or contact your administrator." /> : myAssets.length === 0 ? <Empty icon="inventory_2" title="No assets registered yet" text="Assets assigned to your identity will appear here." /> : <div className="divide-y divide-[#E4EAF1]">{myAssets.slice(0, 5).map(asset => <div key={asset.id} className="flex items-center gap-4 px-6 py-4 transition hover:bg-[#E8F1FB]/55"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1E5FA8]/10 text-[#1E5FA8]"><span className="material-symbols-outlined">token</span></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#0D2B4E]">{asset.name}</p><p className="mt-0.5 font-mono text-[11px] text-[#718096]">{shortAddress(asset.id)}</p></div><span className="hidden rounded-full bg-[#E8F1FB] px-3 py-1 text-[11px] font-bold text-[#1E5FA8] sm:inline-flex">Tier {asset.classificationTier ?? '—'}</span>{asset.pendingTransfer ? <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-700">Transfer pending</span> : <button onClick={() => navigate(`/transfer/request?asset=${asset.id}`)} className="text-xs font-bold text-[#1E5FA8] hover:underline">Transfer</button>}</div>)}</div>}</section>
        <aside className="relative overflow-hidden rounded-2xl bg-[#0D2B4E] p-6 text-white shadow-[0_12px_30px_rgba(13,43,78,0.20)]"><div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:22px_22px]" /><div className="relative"><p className="text-[11px] font-bold tracking-[0.13em] text-[#7AB0FE]">YOUR CREDENTIAL</p><h2 className="mt-2 text-xl font-bold">Identity vault</h2><div className="mt-6 rounded-xl border border-white/15 bg-white/[0.06] p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C8A74C]/20 text-[#E8CC71]"><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span></span><div><p className="text-sm font-bold">{user?.displayName || user?.name || 'Registered User'}</p><p className="text-xs text-[#A9BFDE]">{user?.role || 'USER'} · clearance level {user?.clearanceLevel ?? '—'}</p></div></div><dl className="mt-4 space-y-3 border-t border-white/10 pt-3"><div><dt className="text-[10px] font-bold tracking-[0.12em] text-[#7AB0FE]">DID</dt><dd className="mt-0.5 break-all font-mono text-[11px] leading-5 text-[#E8CC71]">{user?.did || 'Not yet anchored on-chain'}</dd></div><div><dt className="text-[10px] font-bold tracking-[0.12em] text-[#7AB0FE]">WALLET</dt><dd className="mt-0.5 break-all font-mono text-[11px] leading-5 text-[#B9CCE6]">{user?.walletAddress || 'Awaiting wallet credential'}</dd></div></dl></div><button onClick={() => navigate('/profile')} className="mt-5 flex w-full items-center justify-between rounded-xl border border-[#7AB0FE]/35 bg-[#1E5FA8]/30 px-4 py-3 text-sm font-bold transition hover:bg-[#1E5FA8]/55">Manage identity <span>→</span></button><div className="mt-6 border-t border-white/10 pt-5"><p className="text-[11px] font-bold tracking-[0.13em] text-[#7AB0FE]">TRANSFER ACTIVITY</p><p className="mt-2 text-3xl font-bold">{loading ? '—' : pendingTransfers.length}</p><p className="text-sm text-[#B9CCE6]">requests currently in review</p>{!loading && myTransfers.length > 0 && <ul className="mt-4 space-y-2">{myTransfers.slice(0, 4).map((t) => <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-bold text-white">{t.asset?.name || 'Asset'}</p><p className="text-[10px] text-[#9DB6D8]">{t.fromUserId === user?.id ? 'Outgoing' : 'Incoming'}</p></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TRANSFER_STATUS_STYLE[t.status] || 'bg-white/10 text-white'}`}>{t.status}</span></li>)}</ul>}</div></div></aside></div>
    </div>
  </div>;
}
