import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import useBlockNumber from '../../hooks/useBlockNumber';

export default function Topbar({ onOpenNav = () => {} }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isDark = false;
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const blockNumber = useBlockNumber();

  // ─── Theme-aware classes ───
  const bg = isDark ? 'bg-[#060D1A]/95' : 'bg-[#E8F1FB]/80';
  const border = isDark ? 'border-[#1F293D]' : 'border-[#B9DCEF]';
  const textPrimary = isDark ? 'text-white' : 'text-[#0A1F3D]';
  const textSecondary = isDark ? 'text-slate-400' : 'text-[#6B7280]';

  return (
    <header
      className={`
        sticky top-0 z-30 h-16 flex items-center justify-between px-4 sm:px-6 border-b backdrop-blur transition-all
        ${bg} ${border}
      `}
    >
      {/* ── Left: Page Title (optional, can be dynamic) ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className={`-ml-2 rounded-md p-2 lg:hidden ${textPrimary} hover:bg-black/5`}
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>
        <h1 className={`text-lg font-bold ${textPrimary}`}>
          Dashboard
        </h1>
      </div>

      {/* ── Right: Status, Theme Toggle & User ── */}
      <div className="flex items-center gap-5">
        {/* Network Status */}
        <div className="hidden md:flex items-center gap-4">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider border ${
              blockNumber === null
                ? (isDark ? 'bg-amber-950/40 text-amber-400 border-amber-700/30' : 'bg-amber-50 text-amber-700 border-amber-200')
                : (isDark ? 'bg-emerald-950/40 text-emerald-400 border-emerald-700/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
            }`}
            title={blockNumber === null ? 'The configured RPC endpoint is unreachable' : 'Live head block on Ethereum Sepolia'}
          >
            <span className={`w-2 h-2 rounded-full ${blockNumber === null ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
            {blockNumber === null ? 'Chain unreachable' : 'Sepolia connected'}
          </div>
          {blockNumber !== null && (
            <a
              href={`https://sepolia.etherscan.io/block/${blockNumber}`}
              target="_blank"
              rel="noreferrer"
              className={`text-[12px] font-mono hover:underline ${textSecondary}`}
              title="Verify this block on Etherscan"
            >
              Block #{blockNumber.toLocaleString()}
            </a>
          )}
        </div>

        {/* User Profile */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            className={`flex items-center gap-3 pl-4 border-l ${border} transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-[#0A1F3D]/5'} rounded-lg px-3 py-1.5`}
          >
            <div className="text-right">
              <div className={`text-[13px] font-bold ${textPrimary}`}>
                {user?.displayName || user?.name || 'User'}
              </div>
              <div className={`text-[10px] font-black tracking-widest ${isDark ? 'text-[#D4AF37]' : 'text-[#B8962E]'}`}>
                {user?.role || 'USER'}
              </div>
            </div>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
              isDark
                ? 'bg-gradient-to-br from-[#D4AF37] to-[#B8962E]'
                : 'bg-gradient-to-br from-[#0A1F3D] to-[#1E5FA8]'
            }`}>
              <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                person
              </span>
            </div>
          </button>

          {/* Dropdown */}
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className={`absolute right-0 mt-2 w-48 rounded-lg border shadow-lg z-50 overflow-hidden ${
                isDark ? 'bg-[#0D1F38] border-[#1F293D]' : 'bg-white border-[#E8E0D0]'
              }`}>
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/profile'); }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                    isDark ? 'text-slate-300 hover:bg-white/5' : 'text-[#0A1F3D] hover:bg-[#0A1F3D]/5'
                  }`}
                >
                  My Profile
                </button>
                <button
                  onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                    isDark ? 'text-slate-300 hover:bg-white/5' : 'text-[#0A1F3D] hover:bg-[#0A1F3D]/5'
                  }`}
                >
                  Settings
                </button>
                <div className={`border-t ${isDark ? 'border-[#1F293D]' : 'border-[#E8E0D0]'}`} />
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
