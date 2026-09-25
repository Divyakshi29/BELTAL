import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export default function Sidebar({ collapsed, setCollapsed, mobileOpen = false, closeMobile = () => {} }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const menuItems = [
    { path: '/user/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['USER'] },
    { path: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['ADMIN'] },
    { path: '/manager/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['MANAGER'] },
    { path: '/auditor/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['AUDITOR'] },
    { path: '/my-assets', label: 'My Assets', icon: 'inventory_2', roles: ['USER'] },
    { path: '/transfer/request', label: 'Request Transfer', icon: 'send', roles: ['USER'] },
    { path: '/team', label: 'Team Members', icon: 'groups', roles: ['MANAGER'] },
    { path: '/team-assets', label: 'Team Assets', icon: 'shield', roles: ['MANAGER'] },
    { path: '/transfers', label: 'Transfer Approvals', icon: 'swap_horiz', roles: ['MANAGER', 'ADMIN'] },
    { path: '/admin/identities', label: 'Identity Ledger', icon: 'fingerprint', roles: ['ADMIN'] },
    { path: '/admin/registrations', label: 'Registrations', icon: 'how_to_reg', roles: ['ADMIN'] },
    { path: '/admin/roles', label: 'Role Assignment', icon: 'admin_panel_settings', roles: ['ADMIN'] },
    { path: '/admin/quarantine', label: 'Quarantine', icon: 'gpp_bad', roles: ['ADMIN'] },
    { path: '/admin/recovery', label: 'Account Recovery', icon: 'key', roles: ['ADMIN'] },
    { path: '/admin/mint-asset', label: 'Mint Asset', icon: 'add_circle', roles: ['ADMIN'] },
    { path: '/admin/assets', label: 'Asset Registry', icon: 'token', roles: ['ADMIN'] },
    { path: '/audit/assets', label: 'Asset Registry', icon: 'token', roles: ['AUDITOR'] },
    { path: '/admin/zones', label: 'Facility Zones', icon: 'meeting_room', roles: ['ADMIN'] },
    { path: '/passes', label: 'Access Passes', icon: 'badge', roles: ['ADMIN', 'MANAGER'] },
    { path: '/pacs/simulator', label: 'Badge Simulator', icon: 'contactless', roles: ['ADMIN', 'MANAGER'] },
    // ADMIN may read the audit trail (the route allows it) but had no way in.
    { path: '/audit/explorer', label: 'Audit Trail', icon: 'receipt_long', roles: ['AUDITOR', 'ADMIN'] },
    { path: '/audit/verify', label: 'Verification', icon: 'fact_check', roles: ['AUDITOR', 'ADMIN'] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));

  // ─── Theme-aware classes ───
  const bg = isDark ? 'bg-[#060D1A]' : 'bg-[linear-gradient(180deg,#d7ecff_0%,#e9f5ff_48%,#dceeff_100%)] backdrop-blur-xl';
  const border = isDark ? 'border-[#1F293D]' : 'border-[#B9DCEF]';
  const textPrimary = isDark ? 'text-slate-300' : 'text-[#0A1F3D]';
  const hoverBg = isDark ? 'hover:bg-white/5' : 'hover:bg-white/75 hover:shadow-sm';
  const activeBg = isDark ? 'bg-[#0D1F38] text-[#D4AF37]' : 'bg-[#0D2B4E] text-white shadow-[0_8px_20px_rgba(13,43,78,0.16)]';
  const inactiveText = isDark ? 'text-slate-400' : 'text-[#4A5568]';

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-40 flex flex-col border-r transition-transform duration-200 ease-out
        lg:transition-[width]
        ${bg} ${border} ${textPrimary}
        w-64 ${collapsed ? 'lg:w-16' : 'lg:w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
      `}
      aria-hidden={undefined}
    >
      {/* Drawer dismiss — mobile only; on lg+ the rail is always present. */}
      <button
        type="button"
        onClick={closeMobile}
        aria-label="Close navigation"
        className="absolute right-2 top-4 rounded-md p-1 text-[#4A5568] hover:bg-black/5 lg:hidden"
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      {/* ── Logo ── */}
      <div className={`h-16 flex items-center ${collapsed ? 'justify-center' : 'px-5'} border-b ${border}`}>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-[#D4AF37]" style={{ fontVariationSettings: "'FILL' 1" }}>
            security
          </span>
          {!collapsed && (
            <div className="flex flex-col">
              <span className={`text-sm font-black tracking-widest ${isDark ? 'text-white' : 'text-[#0A1F3D]'}`}>
                BELTAL
              </span>
              <span className={`text-[10px] font-bold tracking-[0.22em] ${isDark ? 'text-[#D4AF37]' : 'text-[#B8962E]'}`}>
                SOVEREIGN LEDGER
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── User Info ── */}
      {!collapsed && (
        <div className={`px-4 py-3 border-b ${border}`}>
          <div className={`px-3 py-1.5 rounded-md text-[11px] font-black tracking-wider inline-block ${
            isDark ? 'bg-[#0D1F38] text-[#D4AF37] border border-[#1F293D]' : 'bg-[#0A1F3D] text-[#FDFBF7]'
          }`}>
            {user?.role || 'USER'}
          </div>
          <p className={`text-xs mt-1.5 truncate font-medium ${isDark ? 'text-slate-400' : 'text-[#4A5568]'}`}>
            {user?.displayName || user?.name || 'Registered User'}
          </p>
        </div>
      )}

      {/* ── Navigation ── */}
      <nav aria-label="Primary" className="flex-1 p-3 space-y-1 overflow-y-auto">
        {filteredMenu.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all
                ${isActive ? activeBg : `${inactiveText} ${hoverBg}`}
                ${collapsed ? 'lg:justify-center' : ''}
              `}
              title={collapsed ? item.label : ''}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                {item.icon}
              </span>
              <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Bottom Actions ── */}
      <div className={`p-3 border-t ${border} space-y-1`}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden lg:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${inactiveText} ${hoverBg} ${collapsed ? 'justify-center' : ''}`}
        >
          <span className="material-symbols-outlined text-[20px]">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
          {!collapsed && <span>Collapse</span>}
        </button>
        <button
          onClick={logout}
          aria-label="Logout"
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all text-red-500 ${isDark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'} ${collapsed ? 'justify-center' : ''}`}
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
