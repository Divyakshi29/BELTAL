import { useState, useEffect } from 'react';
import { useAuth, shortenAddress } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { userApi } from '../services/api';
import { gradeLabel } from '../config/grades';

export default function ProfilePage() {
  const { user } = useAuth(); const { theme } = useTheme(); const dark = theme === 'dark';
  // seniorityGrade/manager are organizational metadata, not JWT claims, so
  // they aren't on `user` from AuthContext — fetch the fuller identity view.
  const [orgInfo, setOrgInfo] = useState(null);
  useEffect(() => {
    if (!user?.isRegistered) return;
    let cancelled = false;
    userApi.getMe().then((data) => { if (!cancelled) setOrgInfo(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.isRegistered]);
  const details = [['Decentralized identifier (DID)', user?.did || 'Not yet anchored on-chain'], ['Wallet address', user?.walletAddress || 'Not available'], ['Assigned role', user?.role || 'USER'], ['Clearance level', String(user?.clearanceLevel ?? 1)], ['Strategic business unit', user?.sbu || 'Not assigned'], ['Organizational grade', gradeLabel(orgInfo?.seniorityGrade)], ['Reports to', orgInfo?.manager?.displayName || 'No manager assigned'], ['Identity status', user?.isRegistered ? 'Registered identity' : 'Wallet verified — onboarding pending']];
  const muted = dark ? 'text-[#A9BFDE]' : 'text-[#58718B]';
  return <section className={`min-h-full px-5 py-8 sm:px-8 lg:px-12 ${dark ? 'bg-[#060D1A] text-white' : 'bg-[radial-gradient(circle_at_90%_0%,#dbeeff_0%,transparent_30rem),#F4F8FC] text-[#0D2B4E]'}`}><div className="mx-auto max-w-5xl"><header className="mb-7"><p className="text-xs font-bold tracking-[.18em] text-[#1E8A9B] uppercase">Officer Console</p><h1 className="mt-2 text-3xl font-black">My Profile</h1><p className={`mt-2 max-w-2xl text-sm ${muted}`}>Your identity attributes are issued by an administrator and secured by your wallet signature.</p></header><div className={`overflow-hidden rounded-2xl border shadow-[0_14px_35px_rgba(13,43,78,.13)] backdrop-blur-xl ${dark ? 'border-[#28415E] bg-[#0D1F38]/90' : 'border-[#B9DCEF] bg-white/65'}`}><div className={`flex items-center gap-4 border-b p-6 ${dark ? 'border-[#28415E]' : 'border-[#C9DDED]'}`}><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1E5FA8] text-xl font-black text-white shadow-lg">{shortenAddress(user?.walletAddress || 'OF').slice(0, 2).toUpperCase()}</div><div><h2 className="font-bold">{user?.displayName || user?.name || 'Officer'}</h2><p className={`mt-1 font-mono text-xs ${muted}`}>{shortenAddress(user?.walletAddress)}</p></div><span className="ml-auto hidden rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-500 sm:inline-flex">Identity secured</span></div><dl className={`divide-y ${dark ? 'divide-[#28415E]' : 'divide-[#D9E7F3]'}`}>{details.map(([label, value]) => <div key={label} className="grid gap-1 px-6 py-4 transition hover:bg-[#1E5FA8]/[.06] sm:grid-cols-3 sm:gap-4"><dt className={`text-sm ${muted}`}>{label}</dt><dd className="break-all text-sm font-semibold sm:col-span-2">{value}</dd></div>)}</dl></div></div></section>;
}
