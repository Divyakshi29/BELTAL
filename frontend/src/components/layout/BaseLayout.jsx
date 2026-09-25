import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useTheme } from '../../context/ThemeContext';

export default function BaseLayout() {
  const [collapsed, setCollapsed] = useState(false);
  // Below lg the sidebar is an off-canvas drawer instead of a fixed rail, so
  // the app shell is usable on a phone (issue #69). `collapsed` stays a
  // desktop-only concern; `mobileOpen` never affects the lg+ layout.
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme } = useTheme();
  const location = useLocation();
  const isDark = theme === 'dark';

  // Any navigation closes the drawer — otherwise it would cover the page the
  // user just chose.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className={`min-h-screen flex transition-colors duration-200 ${
      isDark ? 'bg-[#060D1A]' : 'bg-[#E8F1FB]'
    }`}>
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        closeMobile={() => setMobileOpen(false)}
      />
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}
      <div className={`flex-1 flex flex-col min-h-screen transition-[margin] duration-200 ease-out ml-0 ${
        collapsed ? 'lg:ml-16' : 'lg:ml-64'
      }`}>
        <Topbar onOpenNav={() => setMobileOpen(true)} />
        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden">
          <div key={location.pathname} className="app-page-transition">
            <Outlet />
          </div>
        </main>

      </div>
    </div>
  );
}
