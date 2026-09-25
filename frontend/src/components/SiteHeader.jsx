import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, shortenAddress } from '../context/AuthContext';
import LoginModal from './auth/LoginModal';

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img src="/bel-shield.svg" alt="BEL Emblem" className="h-10 sm:h-12 w-auto" />
      <div className="leading-none">
        <p className="text-xl sm:text-2xl font-black tracking-wider"><span className="text-[#0B2545]">BEL</span><span className="text-[#1565C0]">TAL</span></p>
        <p className="hidden sm:block mt-1 text-[8px] font-bold tracking-wider uppercase text-slate-500">Blockchain-Enabled Trusted Access Ledger</p>
      </div>
    </div>
  );
}

function AccountMenu({ user, logout }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const dashboardPath = {
    ADMIN: '/admin/dashboard',
    MANAGER: '/manager/dashboard',
    AUDITOR: '/auditor/dashboard',
    USER: '/user/dashboard',
  }[user?.role] || '/user/dashboard';

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const go = (path) => { setOpen(false); navigate(path); };
  const signOut = () => { setOpen(false); logout(); navigate('/'); };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg bg-[#0B2545] px-3 py-2 text-xs font-bold text-white hover:bg-[#12375f]"
      >
        <span className="hidden sm:inline">{user?.walletAddress ? shortenAddress(user.walletAddress) : 'Officer'}</span>
        <span className="sm:hidden material-symbols-outlined text-[18px]">account_circle</span>
        <span className="material-symbols-outlined text-[16px]">{open ? 'expand_less' : 'expand_more'}</span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-[#0B2545]">{user?.displayName || user?.name || 'Officer'}</p>
            <p className="mt-1 text-[10px] font-bold tracking-wider text-[#A37E2C]">{user?.role || 'USER'}</p>
          </div>
          <button role="menuitem" onClick={() => go(dashboardPath)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
            <span className="material-symbols-outlined text-[18px]">dashboard</span> Dashboard
          </button>
          <button role="menuitem" onClick={() => go('/profile')} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
            <span className="material-symbols-outlined text-[18px]">person</span> My Profile
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button role="menuitem" onClick={signOut} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
            <span className="material-symbols-outlined text-[18px]">logout</span> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default function SiteHeader({ mode = 'home' }) {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    ['Platform', 'platform'], ['Features', 'features'], ['Technology', 'technology'],
    ['Use Cases', 'use-cases'], ['About BEL', 'about-bel'],
  ];
  const goTo = (event, id) => {
    event.preventDefault();
    setMenuOpen(false);
    if (mode !== 'home') navigate(`/#${id}`);
    else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };
  const linkClass = 'py-2 text-sm font-semibold text-slate-600 hover:text-[#1565C0] transition-colors';

  return (
    <>
      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-[#FFFDF5] shadow-sm">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="BELTAL home"><Brand /></Link>
          <nav className="hidden md:flex items-center gap-6">
            {links.map(([label, id]) => <a key={id} href={mode === 'home' ? `#${id}` : `/#${id}`} onClick={(e) => goTo(e, id)} className={linkClass}>{label}</a>)}
            <Link to="/docs" className={linkClass}>API Docs</Link>
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <AccountMenu user={user} logout={logout} />
            ) : <button onClick={() => setLoginOpen(true)} className="rounded-lg bg-[#1565C0] px-3 py-2 text-xs font-bold text-white">Connect Wallet</button>}
            <button type="button" className="md:hidden rounded p-2 text-[#0B2545]" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle navigation">
              <span className="material-symbols-outlined">{menuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="md:hidden border-t border-slate-200 px-4 py-3 flex flex-col">
            {links.map(([label, id]) => <a key={id} href={mode === 'home' ? `#${id}` : `/#${id}`} onClick={(e) => goTo(e, id)} className={linkClass}>{label}</a>)}
            <Link to="/docs" onClick={() => setMenuOpen(false)} className={linkClass}>API Docs</Link>
          </nav>
        )}
      </header>
    </>
  );
}
